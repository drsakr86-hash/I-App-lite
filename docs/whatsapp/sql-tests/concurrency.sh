#!/usr/bin/env bash
# Concurrency tests on the real server: N sessions race for ONE slot / the same reminders / the same inbound message.
set -euo pipefail
D="$1"; PORT="$2"; PGBIN="$3"
P="psql -X -q -t -A -v ON_ERROR_STOP=1 -h $D -p $PORT -U postgres -d wa"
$P -c "truncate public.iapp_appointments, public.iapp_booking_requests; truncate public.wa_messages, public.wa_conversations, public.wa_contacts, public.wa_webhook_events, public.wa_audit restart identity cascade;" >/dev/null
# C1: 12 patients try to book the same slot at once (direct mode) -> exactly one wins
for i in $(seq 1 12); do
  ( $P -c "set role service_role; select (public.wa_book_appointment(null, '2010000000$(printf %02d $i)', 'دمنهور', 'د. عبدالستار', current_date + 3, '20:10', 'مريض $i', 'فحص روتيني')->>'ok')" > "$D/c1_$i" ) &
done; wait
WIN=$(cat "$D"/c1_* | grep -c '^true$'); ROWS=$($P -c "select count(*) from public.iapp_appointments where date=current_date+3 and time='20:10'")
[ "$WIN" = 1 ] && [ "$ROWS" = 1 ] && echo "NOTICE:  C1 12 concurrent bookings of one slot -> 1 winner, 1 row: ok" || { echo "ERROR:  C1 winners=$WIN rows=$ROWS"; exit 1; }
# C2: the same patient retries the same booking 10 times in parallel -> still one row, retries report the existing booking
$P -c "truncate public.iapp_appointments" >/dev/null
for i in $(seq 1 10); do ( $P -c "set role service_role; select public.wa_book_appointment(null,'201099999999','دمنهور','د. عبدالستار', current_date+4,'20:20','منى','فحص روتيني')->>'ok'" > "$D/c2_$i" ) & done; wait
ROWS=$($P -c "select count(*) from public.iapp_appointments where phone='01099999999'"); OKS=$(cat "$D"/c2_* | grep -c '^true$')
[ "$ROWS" = 1 ] && [ "$OKS" = 10 ] && echo "NOTICE:  C2 10 parallel retries of one booking -> 1 row, all 10 told ok: ok" || { echo "ERROR:  C2 rows=$ROWS oks=$OKS"; exit 1; }
# C3: reminders enqueued by 8 overlapping cron runs -> no duplicates
$P -c "truncate public.iapp_appointments; update public.wa_config set enabled=true, reminders_enabled=true, reminder_template='apt_reminder';
 select public.wa_ingest_inbound('201055555555','Test','wamid.C3','text','hi',now());
 select public.wa_set_consent('201055555555', true, false, 'chat');
 insert into public.iapp_appointments(id,patient,phone,date,time,clinic,doctor) values (9001,'اختبار','01055555555',((now() at time zone 'Africa/Cairo') + interval '90 minutes')::date, to_char((now() at time zone 'Africa/Cairo') + interval '90 minutes','HH24:MI'),'دمنهور','د. عبدالستار');" >/dev/null
for i in $(seq 1 8); do ( $P -c "set role service_role; select public.wa_enqueue_reminders()" > "$D/c3_$i" ) & done; wait
Q=$($P -c "select count(*) from public.wa_messages where purpose='reminder'")
[ "$Q" = 1 ] && echo "NOTICE:  C3 8 overlapping reminder runs -> exactly 1 reminder queued: ok" || { echo "ERROR:  C3 reminders=$Q"; exit 1; }
# C4: the same inbound webhook delivered 10 times at once -> one message
for i in $(seq 1 10); do ( $P -c "set role service_role; select public.wa_ingest_inbound('201066666666','Dup','wamid.DUP1','text','مرحبا',now())->>'duplicate'" > "$D/c4_$i" ) & done; wait
M=$($P -c "select count(*) from public.wa_messages where provider_message_id='wamid.DUP1'"); DUPS=$(cat "$D"/c4_* | grep -c '^true$')
[ "$M" = 1 ] && [ "$DUPS" = 9 ] && echo "NOTICE:  C4 10 simultaneous deliveries of one webhook -> 1 message, 9 duplicates: ok" || { echo "ERROR:  C4 msgs=$M dups=$DUPS"; exit 1; }
# C5: two workers claim outbound at once -> every message is claimed by exactly one
CONV=$($P -c "select id from public.wa_conversations limit 1")
for i in $(seq 1 20); do $P -c "set role service_role; select public.wa_enqueue_text($CONV,'staff','manual','m$i','k$i','a@x')" >/dev/null; done
WANT=$($P -c "select count(*) from public.wa_messages where direction='out' and status='queued'")
for w in 1 2 3 4; do ( $P -c "set role service_role; select id from public.wa_claim_outbound(20)" > "$D/c5_$w" ) & done; wait
ALL=$(cat "$D"/c5_* | grep -c .); UNIQ=$(cat "$D"/c5_* | sort -u | grep -c .)
[ "$ALL" = "$WANT" ] && [ "$UNIQ" = "$WANT" ] && echo "NOTICE:  C5 4 workers claiming $WANT queued messages -> each claimed exactly once: ok" || { echo "ERROR:  C5 want=$WANT all=$ALL uniq=$UNIQ"; exit 1; }

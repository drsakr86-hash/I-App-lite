-- Rolls back wa_knowledge_review. FAQ rows already approved stay (they are normal wa_faq rows); only the review log goes.
drop function if exists public.wa_reply_decide(bigint, text, text, text);
drop function if exists public.wa_reply_candidates(int);
drop table if exists public.wa_reply_review;

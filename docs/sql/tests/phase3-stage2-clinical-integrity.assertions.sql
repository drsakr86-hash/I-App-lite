-- Run inside one statement; always ends by raising a sentinel so nothing is committed.
do $$
declare v_study bigint; v_ver bigint; v_visit bigint; ok boolean;
begin
  -- visit with clinical children cannot be deleted
  select v.id into v_visit from iapp_visits_core v where exists(select 1 from iapp_examinations_core e where e.visit_id=v.id) limit 1;
  begin delete from iapp_visits_core where id=v_visit; raise exception 'FAIL: visit delete allowed'; exception when sqlstate '23503' then null; end;
  -- report version lifecycle
  select id into v_study from iapp_imaging_studies_core limit 1;
  insert into iapp_imaging_report_versions_core(imaging_study_id,version_no,report_text,status) values (v_study,9001,'t','draft') returning id into v_ver;
  update iapp_imaging_report_versions_core set report_text='t2' where id=v_ver; -- draft editable
  update iapp_imaging_report_versions_core set status='approved', approved_at=now() where id=v_ver;
  begin update iapp_imaging_report_versions_core set report_text='x' where id=v_ver; raise exception 'FAIL: approved edit allowed'; exception when sqlstate '42501' then null; end;
  begin delete from iapp_imaging_report_versions_core where id=v_ver; raise exception 'FAIL: delete allowed'; exception when sqlstate '42501' then null; end;
  update iapp_imaging_report_versions_core set status='cancelled' where id=v_ver; -- supersession ok
  begin update iapp_imaging_report_versions_core set status='draft' where id=v_ver; raise exception 'FAIL: cancelled edit allowed'; exception when sqlstate '42501' then null; end;
  raise exception 'ASSERTIONS_OK_ROLLBACK';
end $$;

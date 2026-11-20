\set ON_ERROR_STOP 1
\set QUIET 1
create function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin raise notice '% %', case when cond then 'PASS' else 'FAIL' end, label; end $$;
create function pg_temp.denied(q text, label text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'FAIL % (was allowed)', label;
exception when others then
  raise notice 'PASS % [%]', label, sqlerrm;
end $$;
create function pg_temp.allowed(q text, label text) returns void language plpgsql as $$
begin execute q; raise notice 'PASS %', label;
exception when others then raise notice 'FAIL % [%]', label, sqlerrm; end $$;

-- المستخدمون (إنشاء auth.users يُنشئ profiles تلقائياً)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','Owner@x.sa','{"first_name":"أحمد","last_name":"الكاف"}'),
 ('00000000-0000-0000-0000-00000000000b','admin@x.sa','{"first_name":"ريم","last_name":"الشهري"}'),
 ('00000000-0000-0000-0000-00000000000c','sales@x.sa','{"first_name":"فيصل","last_name":"القحطاني"}'),
 ('00000000-0000-0000-0000-00000000000d','designer@x.sa','{}'),
 ('00000000-0000-0000-0000-00000000000e','editor@x.sa','{}'),
 ('00000000-0000-0000-0000-00000000000f','client@x.sa','{}'),
 ('00000000-0000-0000-0000-000000000010','sales2@x.sa','{}');
select pg_temp.ok((select count(*) from profiles) = 7 and (select bool_and(role='client') from profiles), 'signup creates client profiles');
select pg_temp.ok((select email from profiles where id='00000000-0000-0000-0000-00000000000a') = 'owner@x.sa', 'email normalised to lowercase');
-- العميل الحالي أكّد بريده (ربط المشاريع بالبريد المؤكَّد فقط)
update auth.users set email_confirmed_at = now() where email = 'client@x.sa';
-- أول مالك من SQL Editor (بلا auth.uid)
update profiles set role='owner' where email='owner@x.sa';
update profiles set role='admin' where email='admin@x.sa';
update profiles set role='sales' where email in ('sales@x.sa','sales2@x.sa');
update profiles set role='designer' where email='designer@x.sa';
update profiles set role='editor' where email='editor@x.sa';
select pg_temp.ok((select count(*) from audit_log where action='team.role') = 6, 'role changes audited even from SQL editor');

-- ── زائر مجهول يرسل طلباً
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.allowed($$insert into leads(kind,payload,page) values ('booking','{"firstName":"سارة","lastName":"العنزي","email":"Sara@Oud.sa","phone":"+966 55 123","slot_utc":"2026-10-20T08:00:00Z"}','/book')$$, 'anon submits booking');
select pg_temp.allowed($$insert into leads(kind,payload) values ('kit','{"firstName":"سارة","email":"sara@oud.sa"}')$$, 'anon submits kit (same email)');
select pg_temp.allowed($$insert into leads(kind,payload,status,assignee_id) values ('contact','{"email":"spoof@x.sa"}','done','00000000-0000-0000-0000-00000000000c')$$, 'anon spoof attempt accepted as plain lead');
select pg_temp.denied($$insert into leads(kind,payload) values ('contact', jsonb_build_object('m', repeat('x', 20000)))$$, 'anon cannot send oversized payload');
select pg_temp.denied($$insert into leads(kind,payload) values ('hack','{}')$$, 'anon cannot invent lead kind');
select pg_temp.ok((select count(*) from leads) = 0, 'anon cannot read leads');
select pg_temp.ok((select count(*) from contacts) = 0, 'anon cannot read contacts');
select pg_temp.denied($$insert into contacts(name) values ('x')$$, 'anon cannot create contact directly');
reset role;
select pg_temp.ok((select status from leads where payload->>'email'='spoof@x.sa') = 'new' and (select assignee_id from leads where payload->>'email'='spoof@x.sa') is null, 'spoofed status/assignee overridden by server');
delete from leads where payload->>'email'='spoof@x.sa'; delete from contacts where email='spoof@x.sa';
select pg_temp.ok((select count(*) from contacts) = 1, 'two requests, same email → one contact');
select pg_temp.ok((select count(*) from leads where contact_id is not null) = 2, 'both leads linked to contact');
select pg_temp.ok((select value from contacts limit 1) = 0 and (select source from contacts limit 1) = 'booking', 'contact source = first request');
select pg_temp.ok((select count(*) from activities where type='request') = 2, 'request activities logged');

-- ── عميل مسجّل
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from contacts) = 0 and (select count(*) from leads) = 0, 'client sees no CRM data');
select pg_temp.ok((select count(*) from profiles) = 1, 'client sees only own profile');
select pg_temp.denied($$update profiles set role='owner' where id='00000000-0000-0000-0000-00000000000f'$$, 'client cannot promote self');
select pg_temp.allowed($$update profiles set phone='+966500' where id='00000000-0000-0000-0000-00000000000f'$$, 'client edits own phone');
select pg_temp.denied($$update profiles set email='x@y.z' where id='00000000-0000-0000-0000-00000000000f'$$, 'client cannot change profile email');
select pg_temp.ok((select count(*) from payments) = 0 and (select count(*) from audit_log) = 0, 'client sees no payments/audit');

-- ── مبيعات
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from contacts) = 1 and (select count(*) from leads) = 2, 'sales sees CRM');
select pg_temp.allowed($$update contacts set stage='contacted', value=45000$$, 'sales moves stage + value');
select pg_temp.denied($$update contacts set owner_id='00000000-0000-0000-0000-00000000000c'$$, 'sales cannot self-assign (crm.assign)');
select pg_temp.allowed($$update leads set status='in_progress'$$, 'sales updates lead status');
select pg_temp.denied($$update leads set assignee_id='00000000-0000-0000-0000-00000000000c'$$, 'sales cannot assign lead');
select pg_temp.denied($$update leads set payload='{}'$$, 'sales cannot alter lead content');
select pg_temp.allowed($$insert into activities(contact_id,type,body) select id,'call','مكالمة تعريفية' from contacts$$, 'sales logs call (actor defaults to self)');
select pg_temp.denied($$insert into activities(contact_id,type,body,actor_id) select id,'note','x','00000000-0000-0000-0000-00000000000b' from contacts$$, 'sales cannot log as someone else');
select pg_temp.denied($$insert into activities(contact_id,type,body) select id,'stage','fake' from contacts$$, 'sales cannot forge system activity');
update activities set body='edited';
select pg_temp.ok(not exists(select 1 from activities where body='edited'), 'activities are immutable');
select pg_temp.denied($$insert into audit_log(action,entity) values ('x','y')$$, 'sales cannot write audit');
select pg_temp.ok((select count(*) from audit_log) = 0, 'sales cannot read audit');
select pg_temp.denied($$select public.write_audit('x','y','z','w')$$, 'sales cannot call write_audit');
update profiles set role='admin' where id='00000000-0000-0000-0000-000000000010';
delete from contacts;
reset role;
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-000000000010') = 'sales', 'sales cannot change roles (row untouched)');
select pg_temp.ok((select count(*) from contacts) = 1, 'sales cannot delete contacts (row untouched)');
select pg_temp.ok((select stage from contacts) = 'contacted' and (select value from contacts) = 45000, 'stage/value saved');
select pg_temp.ok((select count(*) from activities where type in ('stage','value') and actor_id='00000000-0000-0000-0000-00000000000c') = 2, 'stage+value activities by trigger, attributed to sales');
select pg_temp.ok(exists(select 1 from audit_log where action='crm.stage' and actor_id='00000000-0000-0000-0000-00000000000c'), 'stage change audited with actor');
select pg_temp.ok(exists(select 1 from audit_log where action='crm.lead_status'), 'lead status audited');

-- ── مدير
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.allowed($$update contacts set owner_id='00000000-0000-0000-0000-00000000000c'$$, 'admin assigns contact');
reset role;
select pg_temp.ok((select bool_and(assignee_id='00000000-0000-0000-0000-00000000000c') from leads where status in ('new','in_progress')), 'open leads follow contact owner');
select pg_temp.ok(exists(select 1 from activities where type='assign' and body like '%فيصل%'), 'assign activity names the assignee');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.denied($$update profiles set role='owner' where email='sales2@x.sa'$$, 'admin cannot grant owner');
select pg_temp.denied($$update profiles set role='client' where email='owner@x.sa'$$, 'admin cannot demote owner');
select pg_temp.denied($$update profiles set role='client' where email='admin@x.sa'$$, 'admin cannot change own role');
select pg_temp.allowed($$update profiles set role='designer' where email='sales2@x.sa'$$, 'admin changes sales2 → designer');
select pg_temp.ok((select count(*) from audit_log) > 0, 'admin reads audit');

-- ── مالك
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$update profiles set role='owner' where email='admin@x.sa'$$, 'owner grants owner');
select pg_temp.denied($$update profiles set active=false where email='owner@x.sa'$$, 'owner cannot deactivate self');
select pg_temp.allowed($$update profiles set role='admin' where email='admin@x.sa'$$, 'owner demotes second owner');
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.denied($$update profiles set role='admin' where email='owner@x.sa'$$, 'last owner protected even from SQL editor');

-- ── مصمم: مهامه فقط
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from contacts) = 0 and (select count(*) from payments) = 0, 'designer sees no CRM/payments');
select pg_temp.allowed($$insert into tasks(title,due_at,assignee_id) values ('تجهيز ملف التصميم', now()+interval '1 day','00000000-0000-0000-0000-00000000000d')$$, 'designer adds own task');
select pg_temp.denied($$insert into tasks(title,due_at,assignee_id) values ('x', now(),'00000000-0000-0000-0000-00000000000c')$$, 'designer cannot assign task to others');
select pg_temp.denied($$insert into tasks(title,due_at,assignee_id,created_by) values ('x', now(),'00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000b')$$, 'designer cannot forge created_by');
reset role;
insert into tasks(title,due_at,assignee_id,created_by) values ('مهمة المبيعات', now(), '00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000b');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from tasks) = 1, 'designer sees only own task');
select pg_temp.allowed($$update tasks set done=true$$, 'designer completes own task');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from tasks) = 2, 'sales (crm.view) sees all tasks');

-- ── المدفوعات
reset role;
insert into payments(id,order_ref,kind,amount,status,method,email) values ('p1','KIT-ABC234','kit',75000,'paid','mada','SARA@oud.sa');
select pg_temp.ok(exists(select 1 from activities where type='payment' and body like '750%KIT-ABC234%'), 'paid payment appears on contact timeline');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from payments) = 1, 'sales sees payments');
select pg_temp.denied($$insert into payments(id,amount,status) values ('p2',1,'paid')$$, 'staff cannot forge payments');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.ok((select count(*) from payments) = 0 and (select count(*) from contacts) = 0, 'editor sees no payments/CRM');
select pg_temp.ok((select count(*) from profiles) = 7, 'editor sees team (team.view)');

-- ── حساب معطّل يفقد صلاحياته فوراً
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
update profiles set active=false where email='sales@x.sa';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from contacts) = 0 and (select count(*) from leads) = 0, 'deactivated sales loses access immediately');
reset role;
select pg_temp.ok(exists(select 1 from audit_log where action='team.deactivate'), 'deactivation audited');

-- ── أستوديو العبوات
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from packaging_models where published) = 8, 'seed catalogue: 8 published models');
update packaging_models set published=false where id='C-TOWER';
set role anon;
select pg_temp.ok((select count(*) from packaging_models) = 7, 'anon sees published only');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile) values ('cap','x',10,'[[1,0],[1,10]]')$$, 'anon cannot add models');
update packaging_models set name_ar='hacked';
reset role;
select pg_temp.ok(not exists(select 1 from packaging_models where name_ar='hacked'), 'anon cannot edit models');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from packaging_models) = 8, 'designer sees unpublished too');
select pg_temp.allowed($$insert into packaging_models(id,kind,name_ar,height_mm,neck_mm,profile,published) values ('B-TEST','bottle','تجربة',90,12,'[[20,0],[20,78],[8,82],[8,90]]',false)$$, 'designer adds model');
select pg_temp.allowed($$update packaging_models set published=true where id='B-TEST'$$, 'designer publishes');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile) values ('cap','x',10,'[[1,0]]')$$, 'profile needs ≥ 2 points');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile,thumb) values ('cap','x',10,'[[1,0],[1,10]]', repeat('x', 300000))$$, 'oversized thumbnail rejected');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile,section) values ('cap','x',10,'[[1,0],[1,10]]','hexagon')$$, 'unknown section rejected');
select pg_temp.allowed($$delete from packaging_models where id='B-TEST'$$, 'designer deletes');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
-- sales2 أصبح مصمماً في اختبار سابق؛ نستخدم حساب المحرر بدلاً منه
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile) values ('cap','x',10,'[[1,0],[1,10]]')$$, 'editor (no studio.manage) cannot add');
update packaging_models set published=false where id='B-ATLAS';
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select published from packaging_models where id='B-ATLAS'), 'editor cannot unpublish (row untouched)');
select pg_temp.ok((select count(*) from audit_log where action in ('studio.create','studio.publish','studio.delete') and actor_id='00000000-0000-0000-0000-00000000000d') = 3, 'studio create/publish/delete audited with designer as actor');

-- ── نماذج الذكاء الاصطناعي ومهامها
reset role; select set_config('request.jwt.claim.sub','',false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.allowed($$insert into packaging_models(id,kind,name_ar,height_mm,profile,source,glb_url,published) values ('B-AI1','bottle','منتج بالذكاء',110,'[[20,0],[20,110]]','ai','https://proj.supabase.co/storage/v1/object/public/models/ai/x.glb',true)$$, 'designer saves AI model with https GLB');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile,source,glb_url) values ('bottle','x',100,'[[1,0],[1,10]]','ai','javascript:alert(1)')$$, 'non-https model URL rejected');
select pg_temp.denied($$insert into packaging_models(kind,name_ar,height_mm,profile,source) values ('bottle','x',100,'[[1,0],[1,10]]','ai')$$, 'AI model requires a GLB');
select pg_temp.ok((select count(*) from ai3d_jobs) = 0, 'designer can read jobs table (empty)');
select pg_temp.denied($$insert into ai3d_jobs(provider,provider_task_id) values ('meshy','t')$$, 'jobs not writable from the browser');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from ai3d_jobs) = 0, 'sales cannot see AI jobs');
select pg_temp.ok((select public.has_perm('studio.manage')) = false, 'has_perm RPC: sales lacks studio.manage');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select public.has_perm('studio.manage')) = true, 'has_perm RPC: designer has studio.manage (used by api/ai3d)');
reset role;

-- ── استوديو المبدعين
reset role; select set_config('request.jwt.claim.sub','',false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.allowed($$insert into creatives(id,slug,name_ar,specialties,published) values ('11111111-1111-1111-1111-111111111111','reem','ريم','{identity,label}',true)$$, 'designer adds a creative');
select pg_temp.allowed($$insert into creatives(id,slug,name_ar,specialties,published) values ('22222222-2222-2222-2222-222222222222','draft-one','مسودة','{packaging}',false)$$, 'designer adds an unpublished creative');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('reem','نسخة','{identity}')$$, 'duplicate slug rejected');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('Bad Slug!','x','{identity}')$$, 'invalid slug rejected');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('x1','x','{hacking}')$$, 'unknown specialty rejected');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('x2','x','{}')$$, 'at least one specialty');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties,avatar) values ('x3','x','{identity}','javascript:alert(1)')$$, 'non-https avatar rejected');
select pg_temp.allowed($$insert into creative_works(id,creative_id,title_ar,category,images,year,published) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','هوية','identity','{https://cdn.x/a.webp,https://cdn.x/b.webp}',2025,true)$$, 'designer adds a published work');
select pg_temp.allowed($$insert into creative_works(creative_id,title_ar,category,images,year,published) values ('11111111-1111-1111-1111-111111111111','مسودة عمل','label','{https://cdn.x/c.webp}',2025,false)$$, 'designer adds an unpublished work');
select pg_temp.allowed($$insert into creative_works(creative_id,title_ar,category,images,year,published) values ('22222222-2222-2222-2222-222222222222','عمل مخفي','packaging','{https://cdn.x/d.webp}',2025,true)$$, 'published work under unpublished creative');
select pg_temp.denied($$insert into creative_works(creative_id,title_ar,category,images,year) values ('11111111-1111-1111-1111-111111111111','x','label','{}',2025)$$, 'work needs an image');
select pg_temp.denied($$insert into creative_works(creative_id,title_ar,category,images,year) values ('11111111-1111-1111-1111-111111111111','x','label','{https://a.b/1,javascript:alert(1)}',2025)$$, 'every image must be https');
select pg_temp.denied($$insert into creative_works(creative_id,title_ar,category,images,year) values ('11111111-1111-1111-1111-111111111111','x','label',array_fill('https://a.b/x'::text, array[13]),2025)$$, 'max 12 images');
select pg_temp.denied($$insert into creative_works(creative_id,title_ar,category,images,year) values ('11111111-1111-1111-1111-111111111111','x','label','{https://a.b/1}',1800)$$, 'year range enforced');
select pg_temp.ok((select count(*) from creatives) = 2 and (select count(*) from creative_works) = 3, 'designer sees drafts too');
-- الزائر: المنشور فقط، ولا عمل لمصمم غير منشور
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from creatives) = 1, 'anon sees only published creatives');
select pg_temp.ok((select count(*) from creative_works) = 1, 'anon sees only published works of published creatives');
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('anon','x','{identity}')$$, 'anon cannot add creatives');
update creatives set published=false;
select pg_temp.denied($$insert into creative_works(creative_id,title_ar,category,images,year) values ('11111111-1111-1111-1111-111111111111','x','label','{https://a.b/1}',2025)$$, 'anon cannot add works');
-- العميل والمبيعات والمحرر: قراءة المنشور فقط، بلا كتابة
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from creatives) = 1 and (select count(*) from creative_works) = 1, 'client sees the public catalogue only');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
update creatives set published=false where id='11111111-1111-1111-1111-111111111111';
delete from creative_works;
select pg_temp.denied($$insert into creatives(slug,name_ar,specialties) values ('ed','x','{identity}')$$, 'editor (no studio.manage) cannot add creatives');
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select published from creatives where id='11111111-1111-1111-1111-111111111111') and (select count(*) from creative_works) = 3, 'anon/editor updates and deletes had no effect');
-- إلغاء النشر يخفي الأعمال عن الزائر، والحذف يتسلسل، والتدقيق يسجّل
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
update creatives set published=false, created_at='2000-01-01' where id='11111111-1111-1111-1111-111111111111';
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from creative_works) = 0, 'unpublishing a creative hides its works');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.allowed($$delete from creatives where id='22222222-2222-2222-2222-222222222222'$$, 'designer deletes a creative');
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from creative_works where creative_id='22222222-2222-2222-2222-222222222222') = 0, 'works cascade-deleted with their creative');
select pg_temp.ok((select created_at from creatives where id='11111111-1111-1111-1111-111111111111') > '2001-01-01', 'created_at cannot be rewritten');
select pg_temp.ok((select count(*) from audit_log where action in ('creative.create','creative.unpublish','creative.delete','creative_work.create') and actor_id='00000000-0000-0000-0000-00000000000d') = 7, 'creative changes audited with the designer as actor');
-- طلب تصميم من الزائر يصل للـCRM
set role anon;
select pg_temp.allowed($$insert into leads(kind,payload,page) values ('design','{"firstName":"نوف","email":"nouf@brand.sa","creative":"reem","service":"label","budget":"5-15"}','/creatives/reem')$$, 'anon submits a design brief');
reset role;
select pg_temp.ok((select source from contacts where email='nouf@brand.sa') = 'design', 'design brief creates a contact with source design');

-- ── محتوى الموقع (CMS)
reset role; select set_config('request.jwt.claim.sub','',false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.allowed($$insert into site_content_drafts(key,value) values ('hero','{"line1":{"ar":"عنوان جديد","en":"New title"}}')$$, 'editor saves a draft');
select pg_temp.ok((select updated_by from site_content_drafts where key='hero') = '00000000-0000-0000-0000-00000000000e', 'draft author forced by server');
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('evil','{}')$$, 'unknown content key rejected');
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('faq','[1,2]')$$, 'content must be a JSON object');
select pg_temp.denied($$insert into site_content(key,value) values ('hero','{"x":1}')$$, 'editor cannot write published content directly');
select pg_temp.allowed($$select public.publish_content('hero')$$, 'editor publishes');
select pg_temp.ok((select value->'line1'->>'ar' from site_content where key='hero') = 'عنوان جديد', 'published value matches draft');
select pg_temp.ok((select count(*) from site_content_drafts where key='hero') = 0, 'draft cleared after publish');
select pg_temp.ok((select count(*) from site_content_versions where key='hero') = 1, 'version stored');
select pg_temp.denied($$select public.publish_content('hero')$$, 'publishing without a draft fails');
-- زائر: يقرأ المنشور فقط
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from site_content) = 1, 'anon reads published content');
select pg_temp.ok((select count(*) from site_content_drafts) = 0 and (select count(*) from site_content_versions) = 0, 'anon sees no drafts or versions');
select pg_temp.denied($$select public.publish_content('hero')$$, 'anon cannot publish');
-- مسودة ثانية من المحرر ثم محاولات من أدوار بلا صلاحية
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
insert into site_content_drafts(key,value) values ('hero','{"line1":{"ar":"مسودة سرية","en":"Secret draft"}}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from site_content_drafts) = 0, 'sales cannot read drafts');
select pg_temp.denied($$select public.publish_content('hero')$$, 'sales cannot publish');
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('site','{}')$$, 'sales cannot write drafts');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from site_content_drafts) = 0 and (select count(*) from site_content_versions) = 0, 'client sees no drafts or versions');
reset role;
select pg_temp.ok((select value->'line1'->>'ar' from site_content where key='hero') = 'عنوان جديد', 'published content unchanged by others');
-- النشر الثاني ثم استرجاع النسخة الأولى كمسودة
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.allowed($$select public.publish_content('hero')$$, 'admin publishes second version');
select pg_temp.allowed($$select public.restore_content_version((select id from site_content_versions where value->'line1'->>'ar'='عنوان جديد'))$$, 'admin restores first version as draft');
select pg_temp.ok((select value->'line1'->>'ar' from site_content_drafts where key='hero') = 'عنوان جديد' and (select value->'line1'->>'ar' from site_content where key='hero') = 'مسودة سرية', 'restore creates a draft without touching live content');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.restore_content_version((select id from site_content_versions limit 1))$$, 'sales cannot restore versions');
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from audit_log where action='content.publish') = 2 and (select count(*) from audit_log where action='content.restore') = 1, 'publish and restore audited');
-- حد النسخ: 30 لكل وثيقة
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
do $$ begin for i in 1..32 loop insert into site_content_drafts(key,value) values ('faq', jsonb_build_object('n', i)) on conflict (key) do update set value = excluded.value; perform public.publish_content('faq'); end loop; end $$;
reset role;
select pg_temp.ok((select count(*) from site_content_versions where key='faq') = 30 and (select value->>'n' from site_content where key='faq') = '32', 'versions capped at 30, latest live');

-- ── مشاريع العملاء والاعتمادات
reset role; select set_config('request.jwt.claim.sub','',false);
-- 0x10 أصبح مصمماً في اختبار سابق؟ نثبّت الأدوار هنا
update profiles set role='designer' where id='00000000-0000-0000-0000-00000000000d';
update profiles set role='production' where id='00000000-0000-0000-0000-000000000010';
-- حساب المبيعات عُطّل في اختبار سابق
update profiles set active=true where id='00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(not exists (select 1 from role_permissions where role='designer' and permission='projects.view'), 'designer no longer has projects.view');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into projects(id,title,track,client_email,designer_id,contact_id) values ('aaaaaaaa-0000-0000-0000-000000000001','براند «مسك»','C','Client@X.sa','00000000-0000-0000-0000-00000000000d',(select id from contacts limit 1))$$, 'sales creates a project for a registered client');
select pg_temp.allowed($$insert into projects(id,title,client_email) values ('aaaaaaaa-0000-0000-0000-000000000002','مشروع لعميل لم يسجّل','later@brand.sa')$$, 'sales creates a project for a future client');
select pg_temp.allowed($$insert into projects(id,title,client_email) values ('aaaaaaaa-0000-0000-0000-000000000003','مشروع آخر','other@brand.sa')$$, 'third project (not the designer''s)');
select pg_temp.denied($$insert into projects(title,client_email) values ('x','not-an-email')$$, 'invalid client email rejected');
reset role;
select pg_temp.ok((select client_id from projects where id='aaaaaaaa-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000f', 'project linked to client by email (case-insensitive)');
select pg_temp.ok((select owner_id from projects where id='aaaaaaaa-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000c', 'owner defaults to creator');
select pg_temp.ok((select count(*) from activities where type='project' and body like 'أُنشئ مشروع%') = 1, 'creation logged on the CRM contact');
-- من يرى ماذا
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from projects) = 1, 'designer sees only the assigned project');
select pg_temp.denied($$insert into projects(title,client_email) values ('x','a@b.sa')$$, 'designer cannot create projects');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.ok((select count(*) from projects) = 3, 'production (projects.view) sees all');
select pg_temp.denied($$insert into project_items(project_id,kind,title) values ('aaaaaaaa-0000-0000-0000-000000000001','label','x')$$, 'view-only role cannot upload');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.ok((select count(*) from projects) = 0, 'editor sees no projects');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from projects) = 1, 'client sees only own project');
select pg_temp.denied($$insert into projects(title,client_email) values ('x','client@x.sa')$$, 'client cannot create projects');
update projects set stage='delivered' where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select stage from projects where id='aaaaaaaa-0000-0000-0000-000000000001') = 'brief', 'client cannot change the stage');
-- المصمم يرفع نسخة للاعتماد
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.allowed($$insert into project_items(id,project_id,kind,title,files,status,by_client,version) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','label','ملصق المسك',array['sb:projects/aaaaaaaa-0000-0000-0000-000000000001/a.webp'],'approved',true,9)$$, 'designer uploads v1 (spoofed fields)');
select pg_temp.denied($$insert into project_items(project_id,kind,title) values ('aaaaaaaa-0000-0000-0000-000000000003','label','x')$$, 'designer cannot upload to an unassigned project');
select pg_temp.denied($$insert into project_items(project_id,kind,title,files) values ('aaaaaaaa-0000-0000-0000-000000000001','label','x',array['javascript:alert(1)'])$$, 'non-storage file URL rejected');
select pg_temp.denied($$insert into project_items(project_id,kind,title,studio) values ('aaaaaaaa-0000-0000-0000-000000000001','label','x','{"link":"https://evil.com"}')$$, 'external studio link rejected');
reset role;
select pg_temp.ok((select status||'|'||version||'|'||by_client from project_items where id='bbbbbbbb-0000-0000-0000-000000000001') = 'pending|1|false', 'server forces pending, v1, staff author');
-- العميل يقرر
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from project_items) = 1, 'client sees the item');
update project_items set status='approved' where id='bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.ok((select status from project_items where id='bbbbbbbb-0000-0000-0000-000000000001') = 'pending', 'direct status update has no effect');
select pg_temp.denied($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000001','changes','  ')$$, 'requesting changes needs a note');
select pg_temp.allowed($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000001','changes','الخط أصغر من اللازم')$$, 'client requests changes');
select pg_temp.denied($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000001','approved')$$, 'cannot decide twice');
select pg_temp.ok((select count(*) from project_comments where body='الخط أصغر من اللازم' and from_client) = 1, 'note becomes a client comment');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.denied($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000001','approved')$$, 'designer cannot approve on behalf of the client');
-- نسخة ثانية تحل محل الأولى
select pg_temp.allowed($$insert into project_items(id,project_id,thread_id,kind,title) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','label','ملصق المسك')$$, 'designer uploads v2 in the same thread');
select pg_temp.denied($$insert into project_items(project_id,thread_id,kind,title) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000009','label','x')$$, 'unknown thread rejected');
reset role;
select pg_temp.ok((select version from project_items where id='bbbbbbbb-0000-0000-0000-000000000002') = 2 and (select status from project_items where id='bbbbbbbb-0000-0000-0000-000000000001') = 'superseded', 'v2 numbered and v1 superseded');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
-- النسخة الثالثة تُرفع من آخر نسخة (كما تفعل الواجهة): تُنسب لجذر السلسلة
select pg_temp.allowed($$insert into project_items(id,project_id,thread_id,kind,title) values ('bbbbbbbb-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','label','ملصق المسك')$$, 'designer uploads v3 from v2');
reset role;
select pg_temp.ok((select version||'|'||thread_id from project_items where id='bbbbbbbb-0000-0000-0000-000000000009') = '3|bbbbbbbb-0000-0000-0000-000000000001' and (select status from project_items where id='bbbbbbbb-0000-0000-0000-000000000002') = 'superseded', 'v3 numbered on the root thread and v2 superseded');
-- نعيد v2 معلّقة ونحذف v3 لبقية الاختبارات
delete from project_items where id='bbbbbbbb-0000-0000-0000-000000000009';
update project_items set status='pending' where id='bbbbbbbb-0000-0000-0000-000000000002';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.denied($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000001','approved')$$, 'superseded version cannot be approved');
select pg_temp.allowed($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000002','approved')$$, 'client approves v2');
-- العميل يرسل تصميماً ويعلّق
select pg_temp.allowed($$insert into project_items(id,project_id,kind,title,studio,status) values ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','bottle','عبوتي من الاستوديو','{"link":"/studio-3d?b=B-NOOR","summary":"نور"}','approved')$$, 'client submits a studio design');
select pg_temp.denied($$insert into project_items(project_id,kind,title) values ('aaaaaaaa-0000-0000-0000-000000000003','label','x')$$, 'client cannot post to another client''s project');
select pg_temp.allowed($$insert into project_comments(project_id,body,author_id,from_client) values ('aaaaaaaa-0000-0000-0000-000000000001','متى العينات؟','00000000-0000-0000-0000-00000000000c',false)$$, 'client comments (spoofed author)');
select pg_temp.denied($$insert into project_comments(project_id,body) values ('aaaaaaaa-0000-0000-0000-000000000003','x')$$, 'client cannot comment on another project');
select pg_temp.denied($$select public.decide_item('bbbbbbbb-0000-0000-0000-000000000003','approved')$$, 'own submission is not an approval item');
reset role;
select pg_temp.ok((select status||'|'||by_client from project_items where id='bbbbbbbb-0000-0000-0000-000000000003') = 'submitted|true', 'client submission forced to submitted');
select pg_temp.ok((select author_id::text||'|'||from_client from project_comments where body='متى العينات؟') = '00000000-0000-0000-0000-00000000000f|true', 'comment author forced to the client');
select pg_temp.ok((select count(*) from audit_log where action in ('project.changes','project.approve')) = 2, 'decisions audited');
select pg_temp.ok((select count(*) from activities where type='project' and body like 'اعتمد العميل%') = 1, 'approval logged on CRM contact');
-- عميل يسجّل لاحقاً يرى مشروعه
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000020','Later@Brand.sa','{}');
select pg_temp.ok((select client_id from projects where id='aaaaaaaa-0000-0000-0000-000000000002') is null, 'signup with an unconfirmed email does not see the project');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-000000000020';
select pg_temp.ok((select client_id from projects where id='aaaaaaaa-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-000000000020', 'confirming the email links the waiting project');
-- (يعود غير مؤكَّد لاختبار claim_briefs أدناه)
update auth.users set email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000020';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from projects) = 1 and (select count(*) from project_items) = 0 and (select count(*) from project_comments) = 0, 'new client sees only own project and nothing else');
-- التصاميم المحفوظة
select pg_temp.allowed($$insert into saved_designs(name,link,owner_id) values ('تصميمي','/studio-3d?b=B-ATLAS','00000000-0000-0000-0000-00000000000f')$$, 'client saves a design (spoofed owner)');
select pg_temp.denied($$insert into saved_designs(name,link) values ('x','https://evil.com')$$, 'external design link rejected');
select pg_temp.denied($$insert into saved_designs(name,link,thumb) values ('x','/studio-3d','javascript:alert(1)')$$, 'non-image thumbnail rejected');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from saved_designs) = 0, 'other client cannot see the design');
reset role;
select pg_temp.ok((select owner_id from saved_designs where name='تصميمي') = '00000000-0000-0000-0000-000000000020', 'owner forced to the saver');
-- حذف المشروع يتسلسل
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
delete from projects where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) from projects where id='aaaaaaaa-0000-0000-0000-000000000001') = 1, 'sales cannot delete a project (owner/admin only)');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$delete from projects where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'owner deletes a project');
reset role;
select pg_temp.ok((select count(*) from project_items where project_id='aaaaaaaa-0000-0000-0000-000000000001') = 0 and (select count(*) from project_comments where project_id='aaaaaaaa-0000-0000-0000-000000000001') = 0, 'items and comments cascade');

-- ── وثيقة أسعار العلب
reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('pricing','{"box":{"waste":9}}')$$, 'editor cannot draft prices (pricing.manage)');
select pg_temp.allowed($$insert into site_content_drafts(key,value) values ('announcement','{}') on conflict (key) do update set value = excluded.value$$, 'editor still edits other content');
reset role; delete from site_content_drafts where key='announcement'; set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$insert into site_content_drafts(key,value) values ('pricing','{"box":{"waste":1.2}}')$$, 'owner drafts box pricing');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.denied($$select public.publish_content('pricing')$$, 'editor cannot publish prices');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$select public.publish_content('pricing')$$, 'owner publishes box pricing');
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select value->'box'->>'waste' from site_content where key='pricing') = '1.2', 'visitors read published pricing');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
set role authenticated;
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('pricing','{}')$$, 'sales cannot change pricing');
reset role;

-- ── «ابدأ مسارك»: الملخص قبل الحساب
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.allowed($$insert into leads(kind,payload,project_id) values ('brief','{"track":"C","email":"later@brand.sa","firstName":"لاحق","phone":"0551112222","brand":"عنبر","a_need":"box,label"}','aaaaaaaa-0000-0000-0000-000000000002')$$, 'visitor sends a brief (forged project link)');
select pg_temp.allowed($$insert into leads(kind,payload) values ('brief','{"track":"A","email":"unconf@brand.sa"}')$$, 'visitor sends a brief for an unconfirmed email');
select pg_temp.denied($$select public.claim_briefs()$$, 'anon cannot claim');
reset role;
select pg_temp.ok((select project_id from leads where payload->>'email'='later@brand.sa') is null, 'forged project link reset on insert');
select pg_temp.ok((select source from contacts where phone='+966551112222') = 'brief', 'brief creates a contact with source brief');
-- عملاء دوليون: الدولة تُحفظ، والجوال السعودي المحلي يطابق العميل نفسه بصيغة E.164
insert into leads(kind,payload) values ('brief','{"track":"D","email":"intl@brand.ae","firstName":"ريم","phone":"+971501234567","country":"ae"}');
select pg_temp.ok((select country from contacts where email='intl@brand.ae') = 'AE', 'international lead stores its country (upper-cased)');
insert into leads(kind,payload) values ('contact','{"email":"other@brand.sa","phone":"055 111 2222","country":"S1"}');
select pg_temp.ok((select count(*) from contacts where phone in ('+966551112222','0551112222')) = 1, 'local 05 number matches the same contact as its E.164 form');
insert into leads(kind,payload) values ('kit','{"email":"bad@brand.sa","phone_country":"KW","country":"<x>"}');
select pg_temp.ok((select country from contacts where email='bad@brand.sa') is null, 'invalid country code is dropped, not stored');
select pg_temp.denied($$update contacts set country = 'Saudi' where email = 'intl@brand.ae'$$, 'country must be a two-letter code');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000031','gb@brand.co.uk','{"first_name":"Amy","phone":"+447700900123","country":"gb"}');
select pg_temp.ok((select country from profiles where id='00000000-0000-0000-0000-000000000031') = 'GB', 'registration country lands on the profile');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000021','unconf@brand.sa','{}');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',false);
select pg_temp.ok((select count(*) from public.claim_briefs()) = 0, 'unconfirmed email claims nothing');
reset role; update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-000000000020';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from public.claim_briefs()) = 1, 'confirmed client claims own brief');
select pg_temp.ok((select count(*) from public.claim_briefs()) = 0, 'claim is one-time');
select pg_temp.ok((select count(*) from projects where title = 'عنبر' and stage = 'brief' and track = 'C' and owner_id is null and brief->>'a_need' = 'box,label') = 1, 'project from brief: title, stage, track, no staff owner, brief kept');
update projects set brief = '{}' where title = 'عنبر';
reset role;
select pg_temp.ok((select brief->>'a_need' from projects where title = 'عنبر') = 'box,label', 'client cannot edit the project');
select pg_temp.ok((select p.title from leads l join projects p on p.id = l.project_id where l.payload->>'email'='later@brand.sa') = 'عنبر', 'lead linked to its project');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$update leads set project_id = null where payload->>'email'='later@brand.sa'$$, 'staff cannot relink a brief');
reset role;

-- ── مراحل خاصة بكل مسار
reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into projects(title,track,client_email,stage) values ('طباعة','F','p@brand.sa','proof')$$, 'track F accepts its own stage');
select pg_temp.denied($$insert into projects(title,track,client_email,stage) values ('طباعة2','F','p@brand.sa','formula')$$, 'track F rejects another track''s stage');
select pg_temp.denied($$insert into projects(title,track,client_email,stage) values ('عام','','p@brand.sa','proof')$$, 'untracked project rejects track stages');
select pg_temp.allowed($$insert into projects(title,client_email,stage) values ('عام','p@brand.sa','sampling')$$, 'untracked project keeps generic stages');
select pg_temp.denied($$update projects set track = 'D' where title = 'طباعة'$$, 'changing track without mapping the stage is rejected');
select pg_temp.allowed($$update projects set track = 'D', stage = 'concepts' where title = 'طباعة'$$, 'changing track with a valid stage');
reset role;
select pg_temp.ok(public.stage_label('A','formula') = 'التركيبة والعينات' and public.stage_label('F','delivered') = 'التسليم' and public.stage_label(null,'brief') = 'الملخص والاتجاه', 'Arabic stage labels for the activity log');

-- ── عروض الأسعار والعربون (مشروع «عنبر»: مسار C، عميله 20، مربوط بعميل CRM)
reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$insert into project_quotes(project_id,status,lines) select id,'paid','[]' from projects where title='عنبر'$$, 'cannot create a quote already paid');
select pg_temp.denied($$insert into project_quotes(project_id,lines) select id,'[{"label":"x","qty":0,"unit":5}]' from projects where title='عنبر'$$, 'zero quantity rejected');
select pg_temp.denied($$insert into project_quotes(project_id,lines) select id,'[{"label":"","qty":1,"unit":5}]' from projects where title='عنبر'$$, 'empty line label rejected');
select pg_temp.allowed($$insert into project_quotes(project_id,lines,deposit_pct,subtotal,total,ref) select id,'[{"label":"تصميم العلبة","qty":1,"unit":5000},{"label":"طباعة 1000 علبة","qty":1000,"unit":4.5}]',50,1,1,'QT-FAKE' from projects where title='عنبر'$$, 'sales drafts a quote (forged totals and ref)');
reset role;
select pg_temp.ok((select subtotal = 9500 and vat = 1425 and total = 10925 and deposit = 5462.50 and ref like 'QT-%' and ref <> 'QT-FAKE' from project_quotes q join projects p on p.id=q.project_id where p.title='عنبر'), 'totals, 15% VAT, deposit and ref computed on the server');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from project_quotes) = 0, 'client cannot see a draft');
select pg_temp.denied($$select public.send_quote((select id from project_quotes limit 1))$$, 'client cannot send');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select public.send_quote(q.id) from project_quotes q join projects p on p.id=q.project_id where p.title='عنبر'$$, 'sales sends the quote');
select pg_temp.denied($$update project_quotes set lines='[{"label":"x","qty":1,"unit":1}]' where status='sent'$$, 'a sent quote is locked');
select pg_temp.denied($$delete from project_quotes where status='sent'$$, 'a sent quote cannot be deleted');
reset role;
select pg_temp.ok((select c.stage = 'proposal' and c.value = 10925 from contacts c where phone='+966551112222'), 'CRM deal moves to proposal with the quote value');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from project_quotes where status='sent') = 1, 'client sees the sent quote');
select pg_temp.denied($$select public.decide_quote((select id from project_quotes where status='sent'),'changes','')$$, 'changes need a note');
select pg_temp.allowed($$select public.decide_quote((select id from project_quotes where status='sent'),'changes','الطباعة أغلى من المتوقع')$$, 'client asks for changes');
select pg_temp.ok((select count(*) from project_comments where body like 'ملاحظة على عرض السعر%الطباعة أغلى%') = 1, 'the note lands in the project chat');
select pg_temp.denied($$select public.mark_quote_paid((select id from project_quotes limit 1),'bank','x',1)$$, 'client cannot mark paid');
select pg_temp.denied($$select public.record_deposit((select id from project_quotes limit 1),'pay_1',100)$$, 'client cannot record a gateway payment');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_quotes(project_id,lines,deposit_pct) select id,'[{"label":"تصميم العلبة","qty":1,"unit":5000},{"label":"طباعة 1000 علبة","qty":1000,"unit":4}]',30 from projects where title='عنبر'$$, 'sales drafts v2');
select pg_temp.allowed($$select public.send_quote(id) from project_quotes where status='draft'$$, 'sales sends v2');
reset role;
select pg_temp.ok((select string_agg(status, ',' order by created_at) from project_quotes) = 'void,sent', 'v1 voided when v2 is sent');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.allowed($$select public.decide_quote((select id from project_quotes where status='sent'),'accepted')$$, 'client accepts v2');
set role service_role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select public.record_deposit((select id from project_quotes where status='accepted'),'pay_ABC',100)) = 'amount_mismatch', 'gateway amount must match the deposit');
select pg_temp.ok((select public.record_deposit((select id from project_quotes where status='accepted'),'pay_ABC',310500)) = 'paid', 'deposit recorded (30% of 10,350)');
select pg_temp.ok((select public.record_deposit((select id from project_quotes where status='paid'),'pay_ABC',310500)) = 'paid', 'recording is idempotent');
select pg_temp.ok((select public.record_deposit((select id from project_quotes where status='paid'),'pay_OTHER',310500)) = 'already_paid', 'a second payment is not recorded');
reset role;
select pg_temp.ok((select stage from projects where title='عنبر') = 'design', 'payment moves the project from brief to its second stage');
select pg_temp.ok((select stage from contacts where phone='+966551112222') = 'won', 'CRM deal won');
select pg_temp.ok((select paid_amount = 3105 and payment_method = 'moyasar' from project_quotes where status='paid'), 'paid amount and method kept');
-- تحويل بنكي يسجّله الفريق
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_quotes(id,project_id,lines) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','[{"label":"هوية","qty":1,"unit":1000}]')$$, 'quote on a second project');
select pg_temp.denied($$select public.mark_quote_paid('bbbbbbbb-0000-0000-0000-000000000001','bank','TRX-1',100)$$, 'a draft cannot be paid');
select pg_temp.allowed($$select public.send_quote('bbbbbbbb-0000-0000-0000-000000000001')$$, 'sent');
select pg_temp.denied($$select public.mark_quote_paid('bbbbbbbb-0000-0000-0000-000000000001','bank','TRX-1',5000)$$, 'amount above total rejected');
select pg_temp.denied($$select public.mark_quote_paid('bbbbbbbb-0000-0000-0000-000000000001','crypto','TRX-1',100)$$, 'unknown method rejected');
select pg_temp.denied($$select public.mark_quote_paid('bbbbbbbb-0000-0000-0000-000000000001','bank','TRX-1',1)$$, 'token amount below the deposit rejected');
select pg_temp.allowed($$select public.mark_quote_paid('bbbbbbbb-0000-0000-0000-000000000001','bank','TRX-1',575)$$, 'sales records a bank transfer');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.ok((select count(*) from project_quotes) = 0, 'editor (no project access) sees no quotes');
reset role;
select pg_temp.allowed($$delete from projects where id='aaaaaaaa-0000-0000-0000-000000000002'$$, 'deleting a project');
select pg_temp.ok((select count(*) from project_quotes where id='bbbbbbbb-0000-0000-0000-000000000001') = 0, 'its quotes cascade');


-- ══ التسعير والربحية والمخزون ══
-- (المستخدمون: a مالك، c مبيعات، e محرر، d مصمم، 10 إنتاج، 20 عميل مشروع «عنبر» — حُذف مشروعه الثاني)
reset role;
insert into projects (id, title, track, client_email, stage) values ('cccccccc-0000-0000-0000-000000000001','مخزون','C','later@brand.sa','brief');
-- ── المخزون
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$insert into inventory_items(sku,name) values ('BTL-50','زجاجة')$$, 'sales cannot add stock items');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$insert into inventory_items(id,sku,name,category,on_hand,avg_cost,reorder_level) values ('dddddddd-0000-0000-0000-000000000001','btl-50','زجاجة 50 مل','bottle',9999,1,200)$$, 'production adds an item (forged balance)');
reset role;
select pg_temp.ok((select sku = 'BTL-50' and on_hand = 0 and avg_cost = 0 from inventory_items where id='dddddddd-0000-0000-0000-000000000001'), 'sku normalised; balance and cost start at zero');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$insert into inventory_moves(item_id,kind,qty) values ('dddddddd-0000-0000-0000-000000000001','receive',100)$$, 'receiving needs a unit cost');
select pg_temp.allowed($$insert into inventory_moves(item_id,kind,qty,unit_cost) values ('dddddddd-0000-0000-0000-000000000001','receive',1000,6)$$, 'receive 1000 @ 6');
select pg_temp.allowed($$insert into inventory_moves(item_id,kind,qty,unit_cost) values ('dddddddd-0000-0000-0000-000000000001','receive',500,9)$$, 'receive 500 @ 9');
reset role;
select pg_temp.ok((select on_hand = 1500 and avg_cost = 7 from inventory_items where sku='BTL-50'), 'weighted average cost = 7');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update inventory_items set on_hand = 1, avg_cost = 0, name = 'زجاجة 50 مل شفافة' where sku='BTL-50'$$, 'editing an item');
reset role;
select pg_temp.ok((select on_hand = 1500 and avg_cost = 7 and name like '%شفافة' from inventory_items where sku='BTL-50'), 'balance cannot be edited directly');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$insert into inventory_moves(item_id,kind,qty) values ('dddddddd-0000-0000-0000-000000000001','issue',2000)$$, 'cannot issue more than on hand');
select pg_temp.denied($$insert into inventory_moves(item_id,kind,qty) values ('dddddddd-0000-0000-0000-000000000001','adjust',-10)$$, 'adjustment needs a note');
select pg_temp.allowed($$insert into inventory_moves(item_id,kind,qty,note) values ('dddddddd-0000-0000-0000-000000000001','adjust',-10,'كسر أثناء النقل')$$, 'stock-take adjustment −10');
select pg_temp.denied($$insert into inventory_moves(item_id,kind,qty) values ('dddddddd-0000-0000-0000-000000000001','reserve',5)$$, 'reservation needs a project');
update inventory_moves set qty = 1; delete from inventory_moves;
select pg_temp.ok((select count(*) from inventory_moves where qty = 1) = 0 and (select count(*) from inventory_moves) = 3, 'moves are append-only (update/delete do nothing)');
select pg_temp.ok((select count(*) from inventory_moves) = 3, 'moves visible to production');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from inventory_items) = 1, 'sales can read stock (for quoting)');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.ok((select count(*) from inventory_items) = 0, 'editor sees no stock');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from inventory_items) = 0 and (select count(*) from inventory_moves) = 0, 'client sees no stock');
-- ── العرض: الخصم والتكلفة
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_quotes(id,project_id,lines,discount_kind,discount_value) values ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','[{"label":"علبة وزجاجة","qty":1000,"unit":20}]','pct',15)$$, 'sales drafts a quote with 15% discount');
reset role;
select pg_temp.ok((select gross = 20000 and discount = 3000 and subtotal = 17000 and vat = 2550 and total = 19550 from project_quotes where id='eeeeeeee-0000-0000-0000-000000000001'), 'discount before VAT: 20,000 − 15% → 17,000 + VAT 2,550');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into quote_costs(quote_id,lines,extra_cost) values ('eeeeeeee-0000-0000-0000-000000000001','[{"unit_cost":7,"item_id":"dddddddd-0000-0000-0000-000000000001"}]',500)$$, 'sales records internal costs');
select pg_temp.denied($$insert into quote_costs(quote_id,lines) values ('eeeeeeee-0000-0000-0000-000000000001','[{"unit_cost":-1}]')$$, 'negative cost rejected');
select pg_temp.allowed($$update quote_costs set lines = '[{"unit_cost":7,"item_id":"dddddddd-0000-0000-0000-000000000001","per_unit":null}]' where quote_id='eeeeeeee-0000-0000-0000-000000000001'$$, 'null per_unit (as the app sends it) is accepted');
select pg_temp.denied($$select public.send_quote('eeeeeeee-0000-0000-0000-000000000001')$$, '15% is above the sales cap (10%)');
select pg_temp.allowed($$update project_quotes set discount_value = 10 where id='eeeeeeee-0000-0000-0000-000000000001'$$, 'sales lowers it to 10%');
select pg_temp.allowed($$select public.send_quote('eeeeeeee-0000-0000-0000-000000000001')$$, 'within cap: sent');
select pg_temp.denied($$update quote_costs set extra_cost = 0 where quote_id='eeeeeeee-0000-0000-0000-000000000001'$$, 'costs lock with the sent quote');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select discount = 2000 and total = 20700 from project_quotes where id='eeeeeeee-0000-0000-0000-000000000001'), 'client sees the discount on the quote');
select pg_temp.ok((select count(*) from quote_costs) = 0, 'client never sees internal costs');
select pg_temp.allowed($$select public.decide_quote('eeeeeeee-0000-0000-0000-000000000001','accepted')$$, 'client accepts');
set role service_role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok(public.record_deposit('eeeeeeee-0000-0000-0000-000000000001','pay_INV',1035000) = 'paid', 'deposit paid');
reset role;
select pg_temp.ok((select reserved = 1000 from inventory_items where sku='BTL-50') and public.reserved_for('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001') = 1000, 'paying the deposit reserves 1,000 bottles for the project');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$insert into inventory_moves(item_id,kind,qty,project_id) values ('dddddddd-0000-0000-0000-000000000001','release',1001,'cccccccc-0000-0000-0000-000000000001')$$, 'cannot release more than reserved');
select pg_temp.allowed($$insert into inventory_moves(item_id,kind,qty,project_id) values ('dddddddd-0000-0000-0000-000000000001','issue',600,'cccccccc-0000-0000-0000-000000000001')$$, 'production issues 600 to the project');
reset role;
select pg_temp.ok((select on_hand = 890 and reserved = 400 from inventory_items where sku='BTL-50'), 'issue lowers stock and the reservation');
select pg_temp.ok((select kind = 'materials' and amount = 4200 from project_costs where project_id='cccccccc-0000-0000-0000-000000000001'), 'issued materials cost the project 600 × 7');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_costs(project_id,kind,amount,note) values ('cccccccc-0000-0000-0000-000000000001','factory',3000,'تعبئة')$$, 'sales records a factory cost');
delete from project_costs where kind='materials';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from project_costs) = 0, 'client never sees project costs');
reset role;
select pg_temp.ok((select count(*) from project_costs where kind='materials') = 1, 'materials cost row survived');
-- ── سياسة التسعير
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select (value->>'margin_floor')::int = 25 from business_settings), 'staff read the pricing policy');
update business_settings set value = '{"discount_caps":{"sales":50}}';
reset role;
select pg_temp.ok((select (value->'discount_caps'->>'sales')::int = 10 from business_settings), 'sales cannot raise its own cap');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.denied($$update business_settings set value = '{"discount_caps":{"sales":150},"margin_floor":20}'$$, 'cap above 100 rejected');
select pg_temp.allowed($$update business_settings set value = '{"discount_caps":{"owner":100,"admin":100,"sales":20},"margin_floor":30}'$$, 'owner sets sales cap 20% and margin floor 30%');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from business_settings) = 0, 'client cannot read the pricing policy');
-- ── الكوبونات
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$insert into coupons(code,kind,value) values ('RAMADAN','pct',20)$$, 'sales cannot create coupons');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$insert into coupons(code,kind,value,max_uses,uses) values ('ramadan','pct',20,2,99)$$, 'owner creates RAMADAN 20% × 2 (forged uses)');
select pg_temp.denied($$insert into coupons(code,kind,value) values ('BAD','pct',150)$$, 'percent above 100 rejected');
select pg_temp.allowed($$insert into coupons(code,kind,value,valid_until) values ('OLD','amount',100,'2020-01-01')$$, 'expired coupon');
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok(public.coupon_price('ramadan','kit',75000) = 60000, 'visitor checks RAMADAN: 750 → 600');
select pg_temp.ok(public.coupon_price('OLD','kit',75000) is null and public.coupon_price('NOPE','kit',75000) is null, 'expired and unknown codes are invalid');
select pg_temp.ok((select count(*) from coupons) = 0, 'visitors cannot list coupons');
select pg_temp.denied($$select public.redeem_coupon('RAMADAN','kit','p1',75000,60000)$$, 'visitor cannot redeem');
set role service_role;
select pg_temp.ok(public.redeem_coupon('RAMADAN','kit','p1',75000,50000) = 'mismatch', 'paid amount must match the coupon price');
select pg_temp.ok(public.redeem_coupon('RAMADAN','kit','p1',75000,60000) = 'ok' and public.redeem_coupon('RAMADAN','kit','p1',75000,60000) = 'ok', 'redeemed once per payment');
select pg_temp.ok(public.redeem_coupon('RAMADAN','kit','p2',75000,60000) = 'ok' and public.redeem_coupon('RAMADAN','kit','p3',75000,60000) = 'invalid', 'max uses enforced');
reset role;
select pg_temp.ok((select uses from coupons where code='RAMADAN') = 2 and (select count(*) from coupon_redemptions) = 2, 'two redemptions recorded');
-- ── الحماية من الإغراق
set role anon; select set_config('request.jwt.claim.sub','',false);
select set_config('request.headers','{"cf-connecting-ip":"9.9.9.9","x-client-ip":"1.1.1.1"}',false);
select pg_temp.ok(public.request_ip() = '9.9.9.9', 'visitor ip from cf-connecting-ip (x-client-ip ignored for visitors)');
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"a1@x.sa"}'),('contact','{"email":"a2@x.sa"}'),('contact','{"email":"a3@x.sa"}'),('contact','{"email":"a4@x.sa"}'),('contact','{"email":"a5@x.sa"}')$$, 'five leads from one address pass');
select pg_temp.denied($$insert into leads(kind,payload) values ('contact','{"email":"a6@x.sa"}')$$, 'sixth lead from the same address within 10 minutes is rate limited');
select set_config('request.headers','{"cf-connecting-ip":"8.8.8.8"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"other@x.sa"}')$$, 'another address still passes');
select set_config('request.headers','{"cf-connecting-ip":"7.7.7.1"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"Same@x.sa"}')$$, 'email 1');
select set_config('request.headers','{"cf-connecting-ip":"7.7.7.2"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"same@x.sa"}')$$, 'email 2');
select set_config('request.headers','{"cf-connecting-ip":"7.7.7.3"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"same@x.sa"}')$$, 'email 3');
select set_config('request.headers','{"cf-connecting-ip":"7.7.7.4"}',false);
select pg_temp.denied($$insert into leads(kind,payload) values ('contact','{"email":" SAME@x.sa "}')$$, 'fourth lead for one email from rotating addresses is rate limited');
reset role;
select pg_temp.ok((select count(*) from contacts where email in ('a6@x.sa')) = 0, 'rejected lead created no contact');
select pg_temp.ok((select count(*) from rate_events) > 0, 'events recorded');
set role anon;
select pg_temp.ok((select count(*) from rate_events) = 0, 'visitors cannot read rate events');
select pg_temp.denied($$select public.rate_hit('x', 1, interval '1 minute')$$, 'visitors cannot call rate_hit');
-- الكوبونات: 10 محاولات لكل عنوان
select set_config('request.headers','{"cf-connecting-ip":"6.6.6.6"}',false);
select pg_temp.ok((select count(*) from generate_series(1,10) g where public.coupon_price('GUESS' || g,'kit',75000) is null) = 10, 'ten coupon guesses answered');
select pg_temp.denied($$select public.coupon_price('RAMADAN','kit',75000)$$, 'eleventh coupon check is rate limited');
set role service_role;
select pg_temp.ok(public.coupon_price('OLD','kit',75000) is null, 'server (service key) is not rate limited');
-- التحقق البشري الإلزامي
reset role;
update business_settings set value = value || '{"captcha_required":true}';
set role anon; select set_config('request.headers','{"cf-connecting-ip":"5.5.5.5"}',false);
select pg_temp.denied($$insert into leads(kind,payload) values ('contact','{"email":"bot@x.sa"}')$$, 'with captcha required, visitors cannot insert directly');
set role service_role; select set_config('request.headers','{"x-client-ip":"5.5.5.5"}',false);
select pg_temp.ok(public.request_ip() = '5.5.5.5', 'server passes the visitor ip in x-client-ip');
select pg_temp.allowed($$insert into leads(kind,payload) values ('contact','{"email":"human@x.sa"}')$$, 'verified lead via the server passes');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false); select set_config('request.headers','{"cf-connecting-ip":"5.5.5.6"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('brief','{"track":"A","email":"client@x.sa"}')$$, 'signed-in clients are not asked for captcha');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.denied($$update business_settings set value = value || '{"captcha_required":"yes"}'$$, 'captcha flag must be boolean');
reset role; select set_config('request.headers','',false);
update business_settings set value = value - 'captcha_required';
-- ── الصفحات القانونية في المحتوى
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.allowed($$insert into site_content_drafts(key,value) values ('legal','{"updated":"2026-10-20"}') on conflict (key) do update set value = excluded.value$$, 'editor drafts the legal pages');
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('legalese','{}')$$, 'unknown content key rejected');
reset role;
-- ── «عطرك الخاص» (المسار P)
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000030','noura@scent.sa', now());
set role anon; select set_config('request.jwt.claim.sub','',false); select set_config('request.headers','{"cf-connecting-ip":"4.4.4.4"}',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('brief','{"track":"P","email":"noura@scent.sa","firstName":"نورة","p_top":"bergamot","p_heart":"rose_taifi","p_base":"oud_cambodi","p_conc":"edp","p_size":"50","p_mode":"video"}')$$, 'visitor sends a signature-scent composition');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000030',false);
select pg_temp.ok((select count(*) from public.claim_briefs()) = 1, 'individual claims the composition as a project');
reset role;
select pg_temp.ok((select track = 'P' and stage = 'brief' and brief ->> 'p_heart' = 'rose_taifi' from projects where client_email='noura@scent.sa'), 'project on track P at the composition stage, with the composition');
select pg_temp.ok(public.track_stages('P') = array['brief','sampling','bottling','delivered'] and public.stage_label('P','sampling') = 'العينات التجريبية', 'track P stages and labels');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$update projects set stage='sampling' where client_email='noura@scent.sa'$$, 'team moves it to trial samples');
select pg_temp.denied($$update projects set stage='design' where client_email='noura@scent.sa'$$, 'stage from another track rejected');
select pg_temp.denied($$update projects set track='Z' where client_email='noura@scent.sa'$$, 'unknown track rejected');
reset role; select set_config('request.headers','',false);
-- ── مراجعة: صلاحيات وسجلات مالية
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok(public.discount_cap('sales') = 0, 'clients cannot read internal discount caps');
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.denied($$select public.reserved_for('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001')$$, 'visitors cannot query reservations');
reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
delete from projects where id='cccccccc-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) from projects where id='cccccccc-0000-0000-0000-000000000001') = 1, 'a project with a paid quote cannot be deleted (financial record)');
-- ── العقود
reset role;
insert into projects (id, title, track, client_email) values ('eeeeeeee-0000-0000-0000-000000000001','عقد مسك','E','client@x.sa');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_contracts(id,project_id,title,company,client,sections,specs,status,client_signature) values ('ffffffff-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','عقد تصنيع','{"name":"المصنع"}','{"name":"العميل"}','[{"title":"موضوع العقد","body":"تصنيع 1000 عبوة"}]','[{"name":"زجاجة 50 مل","qty":1000,"unit":"قطعة","images":["sb:projects/eeeeeeee-0000-0000-0000-000000000001/a.webp"],"files":[]}]','signed','sb:x')$$, 'sales drafts a contract (forged status and signature)');
reset role;
select pg_temp.ok((select status = 'draft' and client_signature is null and ref like 'CT-%' from project_contracts where id='ffffffff-0000-0000-0000-000000000001'), 'insert forced to an unsigned draft with a CT ref');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$insert into project_contracts(project_id,title,specs) values ('eeeeeeee-0000-0000-0000-000000000001','x','[{"name":"y","qty":1,"images":["sb:projects/aaaaaaaa-0000-0000-0000-000000000003/z.webp"]}]')$$, 'attachments from another project''s folder rejected');
select pg_temp.denied($$insert into project_contracts(project_id,title,specs) values ('eeeeeeee-0000-0000-0000-000000000001','x','[{"name":"y","qty":0}]')$$, 'zero quantity rejected');
select pg_temp.denied($$insert into project_contracts(project_id,title,sections) values ('eeeeeeee-0000-0000-0000-000000000001','x','{"a":1}')$$, 'malformed sections rejected');
-- العميل لا يرى المسودة
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from project_contracts) = 0, 'client cannot see a draft contract');
select pg_temp.denied($$select public.send_contract('ffffffff-0000-0000-0000-000000000001')$$, 'client cannot send');
-- الإرسال
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select public.send_contract('ffffffff-0000-0000-0000-000000000001')$$, 'sales sends the contract');
reset role;
select pg_temp.ok((select status = 'sent' and length(content_hash) = 64 from project_contracts where id='ffffffff-0000-0000-0000-000000000001'), 'sent with a sha256 fingerprint');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$update project_contracts set title = 'معدَّل' where id='ffffffff-0000-0000-0000-000000000001'$$, 'sent contract content is locked');
select pg_temp.denied($$select public.sign_contract('ffffffff-0000-0000-0000-000000000001','company','sb:projects/eeeeeeee-0000-0000-0000-000000000001/s.png','فيصل',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001'))$$, 'sales cannot sign for the company');
delete from project_contracts where id='ffffffff-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) from project_contracts where id='ffffffff-0000-0000-0000-000000000001') = 1, 'sent contract still exists');
-- العميل
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from project_contracts) = 1, 'client sees the sent contract');
select pg_temp.denied($$select public.sign_contract('ffffffff-0000-0000-0000-000000000001','client','sb:projects/eeeeeeee-0000-0000-0000-000000000001/s.png','نورة','0000')$$, 'signing a different fingerprint rejected');
select pg_temp.denied($$select public.sign_contract('ffffffff-0000-0000-0000-000000000001','client','sb:projects/aaaaaaaa-0000-0000-0000-000000000003/s.png','نورة',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001'))$$, 'signature image from another project rejected');
select pg_temp.denied($$select public.sign_contract('ffffffff-0000-0000-0000-000000000001','company','sb:projects/eeeeeeee-0000-0000-0000-000000000001/s.png','نورة',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001'))$$, 'client cannot sign as the company');
select pg_temp.allowed($$select public.contract_changes('ffffffff-0000-0000-0000-000000000001','الكمية 1500')$$, 'client requests changes');
reset role;
select pg_temp.ok((select status||'|'||change_note from project_contracts where id='ffffffff-0000-0000-0000-000000000001') = 'changes|الكمية 1500' and (select count(*) from project_comments where body like 'ملاحظة على العقد%') = 1, 'changes recorded and posted to the project thread');
-- التعديل ثم إعادة الإرسال ثم التوقيع
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$update project_contracts set specs = '[{"name":"زجاجة 50 مل","qty":1500,"unit":"قطعة","images":[],"files":[]}]' where id='ffffffff-0000-0000-0000-000000000001'$$, 'sales edits the contract after a change request');
select pg_temp.allowed($$select public.send_contract('ffffffff-0000-0000-0000-000000000001')$$, 'sales re-sends');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok(public.sign_contract('ffffffff-0000-0000-0000-000000000001','client','sb:projects/eeeeeeee-0000-0000-0000-000000000001/sig-client.png','نورة العميل',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001')) = 'client_signed', 'client signs the shown fingerprint');
select pg_temp.denied($$select public.sign_contract('ffffffff-0000-0000-0000-000000000001','client','sb:projects/eeeeeeee-0000-0000-0000-000000000001/sig-client.png','نورة',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001'))$$, 'cannot sign twice');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.reopen_contract('ffffffff-0000-0000-0000-000000000001')$$, 'a client-signed contract cannot be reopened for editing');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.ok(public.sign_contract('ffffffff-0000-0000-0000-000000000001','company','sb:projects/eeeeeeee-0000-0000-0000-000000000001/sig-co.png','أحمد الكاف',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000001')) = 'signed', 'owner countersigns → signed');
reset role;
select pg_temp.ok((select client_signed_name||'|'||company_signed_name||'|'||(client_signed_at is not null) from project_contracts where id='ffffffff-0000-0000-0000-000000000001') = 'نورة العميل|أحمد الكاف|true', 'both signatures recorded with names and times');
select pg_temp.ok((select count(*) from audit_log where action like 'contract.%') >= 4, 'contract actions audited');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.void_contract('ffffffff-0000-0000-0000-000000000001')$$, 'sales cannot void a signed contract');
reset role;

-- ══ شحنات عينة الاكتشاف ══
reset role;
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.allowed($$insert into leads(kind,payload,page) values ('kit','{"firstName":"نورة","lastName":"العميل","email":"Client@x.sa","phone":"0551234567","country":"SA","city":"Riyadh","address":"حي النرجس","order_ref":"KIT-7F3K9Q","directions":"عودي · زهري · خشبي"}','/discovery-kit')$$, 'anon orders a kit');
select pg_temp.allowed($$insert into leads(kind,payload) values ('kit','{"email":"someone@else.sa","order_ref":"kit-abc123"}')$$, 'second kit order (lowercase ref)');
select pg_temp.allowed($$insert into leads(kind,payload) values ('kit','{"email":"noref@else.sa"}')$$, 'kit lead without a ref is still accepted');
select pg_temp.ok((select count(*) from kit_orders) = 0, 'anon cannot read kit orders');
select pg_temp.ok((select kit_track('kit-7f3k9q') ->> 'status') = 'new' and (kit_track('KIT-7F3K9Q') ? 'email') = false and (kit_track('KIT-7F3K9Q') ? 'address') = false, 'public tracking by ref: status only, no personal data');
select pg_temp.ok(kit_track('KIT-NOPE00') is null, 'unknown ref tracks to nothing');
reset role;
select pg_temp.ok((select count(*) from kit_orders) = 2 and (select ref from kit_orders where email='someone@else.sa') = 'KIT-ABC123', 'two orders created from the leads; ref normalised; lead without ref makes none');
select pg_temp.ok((select contact_id is not null and email = 'client@x.sa' and city = 'Riyadh' and jsonb_array_length(history) = 1 from kit_orders where ref='KIT-7F3K9Q'), 'order linked to the contact, email normalised, history opened');
-- العميل يرى شحنته ببريده فقط
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from kit_orders) = 0 and (select count(*) from kit_mine()) = 1 and (select x ->> 'ref' from kit_mine() x) = 'KIT-7F3K9Q' and not ((select x from kit_mine() x) ? 'note'), 'client sees own kit order only, through kit_mine (no direct table read, no internal note)');
update kit_orders set status='delivered' where ref='KIT-7F3K9Q';
reset role;
select pg_temp.ok((select status from kit_orders where ref='KIT-7F3K9Q') = 'new', 'client cannot change the shipment');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from kit_orders) = 0, 'another client sees nothing');
-- الفريق
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.ok((select count(*) from kit_orders) = 0, 'editor sees no kit orders');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from kit_orders) = 2, 'sales reads kit orders');
select pg_temp.allowed($$update kit_orders set status='preparing' where ref='KIT-7F3K9Q'$$, 'sales marks preparing');
select pg_temp.denied($$update kit_orders set status='shipped' where ref='KIT-7F3K9Q'$$, 'shipping needs a carrier');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update kit_orders set status='shipped', carrier='SMSA', tracking_no=' 123456789 ', tracking_url='https://www.smsaexpress.com/trackingdetails?tracknumbers=123456789', ref='KIT-HACKED', email='hack@x.sa', history='[]' where ref='KIT-7F3K9Q'$$, 'production ships with carrier and tracking (forging ref/email/history)');
reset role;
select pg_temp.ok((select ref='KIT-7F3K9Q' and email='client@x.sa' and tracking_no='123456789' and shipped_at is not null and delivered_at is null and jsonb_array_length(history) = 3 and history -> 2 ->> 'status' = 'shipped' and history -> 2 ->> 'by' = '00000000-0000-0000-0000-000000000010' from kit_orders where ref='KIT-7F3K9Q'), 'shipped: server keeps ref/email, trims tracking, logs who and when');
select pg_temp.ok((select count(*) from activities where type='note' and body like 'شُحنت عينة KIT-7F3K9Q%SMSA%123456789') = 1, 'shipping noted on the contact timeline');
select pg_temp.ok((select kit_track('KIT-7F3K9Q') ->> 'tracking_no') = '123456789' and (kit_track('KIT-7F3K9Q') -> 'history' -> 2 ? 'by') = false, 'public tracking shows carrier data but never who acted');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update kit_orders set status='delivered' where ref='KIT-7F3K9Q'$$, 'production marks delivered');
reset role;
select pg_temp.ok((select delivered_at is not null and jsonb_array_length(history) = 4 from kit_orders where ref='KIT-7F3K9Q'), 'delivered timestamp and history');
select pg_temp.ok((select count(*) from tasks where title like 'ادعُ العميل لحجز مكالمة%KIT-7F3K9Q' and due_at between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour' and contact_id = (select contact_id from kit_orders where ref='KIT-7F3K9Q')) = 1, 'delivery schedules the follow-up call task in 3 days on the contact');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$update kit_orders set status='delivered', note='تأكيد' where ref='KIT-7F3K9Q'$$, 'same status again (note only)');
reset role;
select pg_temp.ok((select jsonb_array_length(history) = 4 from kit_orders where ref='KIT-7F3K9Q') and (select count(*) from tasks where title like 'ادعُ العميل%KIT-7F3K9Q') = 1, 'no duplicate history or task without a status change');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$insert into kit_orders(ref,email) values ('KIT-MANUAL','x')$$, 'bad email rejected on manual order');
select pg_temp.allowed($$insert into kit_orders(ref,email,name,city) values ('KIT-MANUAL','manual@x.sa','يدوي','Jeddah')$$, 'sales adds a manual kit order');
delete from kit_orders where ref='KIT-MANUAL';
reset role;
select pg_temp.ok((select count(*) from kit_orders where ref='KIT-MANUAL') = 1, 'sales cannot delete kit orders');

-- ══ أوامر الإنتاج ══
reset role;
insert into projects (id, title, track, client_email, stage) values ('abababab-0000-0000-0000-000000000001','تشغيلة','E','client@x.sa','brief');
update projects set client_id = '00000000-0000-0000-0000-00000000000f' where id = 'abababab-0000-0000-0000-000000000001';
-- المبيعات تدير المشاريع؛ الإنتاج يدير المخزون؛ المحرر والعميل لا
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.denied($$insert into production_orders(ref,batch_no,product,qty,steps) values ('x','x','عطر',1000,'[{"id":"materials","done":false}]')$$, 'editor cannot create production orders');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$insert into production_orders(id,ref,batch_no,project_id,project_title,product,qty,fill_ml,status,released_at,steps,qc,maceration_days) values ('cdcdcdcd-0000-0000-0000-000000000001','FORGED','FORGED','abababab-0000-0000-0000-000000000001','تشغيلة','مسك EDP 50 مل',2000,50,'released',now(),'[{"id":"materials","done":false},{"id":"compound","done":false},{"id":"maceration","done":false},{"id":"release","done":false}]','[{"id":"leak","cls":"critical","defects":null},{"id":"fill","cls":"major","defects":null}]',21)$$, 'production creates an order (forging ref, batch and release)');
reset role;
select pg_temp.ok((select ref ~ '^PO-\d{4}-\d{3,}$' and batch_no ~ '^B\d{6}-\d{2}$' and status = 'planned' and released_at is null and created_by = '00000000-0000-0000-0000-000000000010' from production_orders where id='cdcdcdcd-0000-0000-0000-000000000001'), 'server assigns ref and batch number; a new order is never released');
select pg_temp.ok((select count(*) from audit_log where action = 'production.create') = 1, 'creating an order is audited');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$update production_orders set status='released' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'cannot release with steps undone');
select pg_temp.allowed($$update production_orders set status='in_progress', maceration_start = now(), steps='[{"id":"materials","done":true},{"id":"compound","done":true},{"id":"maceration","done":false},{"id":"release","done":false}]', ref='HACK', batch_no='HACK' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'compounding done: the maceration clock starts');
select pg_temp.denied($$update production_orders set steps='[{"id":"materials","done":true},{"id":"compound","done":true},{"id":"maceration","done":true},{"id":"release","done":false}]' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'maceration cannot be closed early without a deviation');
select pg_temp.allowed($$update production_orders set deviation='موافقة مدير الجودة على التعبئة المبكرة', steps='[{"id":"materials","done":true},{"id":"compound","done":true},{"id":"maceration","done":true},{"id":"release","done":true}]' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'a logged deviation allows closing maceration early');
select pg_temp.denied($$update production_orders set status='released' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'cannot release before QC is complete');
select pg_temp.allowed($$update production_orders set qc='[{"id":"leak","cls":"critical","defects":1},{"id":"fill","cls":"major","defects":2}]', good_units=1960, rejects=40 where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'QC recorded with a critical defect');
select pg_temp.denied($$update production_orders set status='released' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'a critical defect blocks release');
select pg_temp.allowed($$update production_orders set status='released', qc='[{"id":"leak","cls":"critical","defects":0},{"id":"fill","cls":"major","defects":2}]' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'clean QC + yield → released');
reset role;
select pg_temp.ok((select ref <> 'HACK' and batch_no <> 'HACK' and status = 'released' and released_at is not null and released_by = '00000000-0000-0000-0000-000000000010' from production_orders where id='cdcdcdcd-0000-0000-0000-000000000001'), 'ref and batch immutable; release signed by the server');
select pg_temp.ok((select count(*) from audit_log where action = 'production.released') = 1, 'release is audited');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$update production_orders set qty=5 where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'a released batch record is locked');
select pg_temp.allowed($$update production_orders set note='شُحنت للعميل' where id='cdcdcdcd-0000-0000-0000-000000000001'$$, 'only the note stays editable after release');
-- العميل: يرى تقدّم تشغيلة مشروعه فقط، وبلا تفاصيل داخلية
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from production_orders) = 0, 'client cannot read production orders directly');
select pg_temp.ok((select jsonb_array_length(production_progress('abababab-0000-0000-0000-000000000001'))) = 1 and (select production_progress('abababab-0000-0000-0000-000000000001') -> 0 ->> 'status') = 'released' and not (production_progress('abababab-0000-0000-0000-000000000001') -> 0 ? 'qc') and not (production_progress('abababab-0000-0000-0000-000000000001') -> 0 ? 'note') and not (production_progress('abababab-0000-0000-0000-000000000001') -> 0 ? 'bom'), 'client sees the progress of own project: steps and dates only');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok(production_progress('abababab-0000-0000-0000-000000000001') = '[]'::jsonb, 'another client sees nothing');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from production_orders) = 1, 'sales reads production orders');
-- وثيقة التشغيل في المحتوى: للمالك والمدير فقط
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e',false);
select pg_temp.denied($$insert into site_content_drafts(key,value) values ('ops','{"catalog":{}}')$$, 'content editor cannot draft the operations document');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.allowed($$insert into site_content_drafts(key,value) values ('ops','{"catalog":{"hiddenKits":["start-30"]}}')$$, 'owner drafts the operations document');
select pg_temp.allowed($$select publish_content('ops')$$, 'owner publishes it');
reset role;
select pg_temp.ok((select value -> 'catalog' -> 'hiddenKits' ->> 0 from site_content where key='ops') = 'start-30', 'operations document published and public');

-- ══ العينات المسمّاة وعنوان الشحن ورمز الورقة ══
reset role;
select set_config('request.jwt.claim.sub','',false);
-- العطّار (الإنتاج) ينشئ جولة عينات لمشروع، ويسمّي عيناتها بمكوّناتها
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$insert into kit_orders(ref,kind,email,name,city,project_id,token,decided_at,samples) values ('SMP-ROUND1','round','client@x.sa','نورة العميل','Riyadh','abababab-0000-0000-0000-000000000001','guessme-guessme-1234',now(),'[{"id":"s1","code":"A","name":"مسك الليل ١","concentration":"EDP 18%","notes":"أثقل في القاعدة","decision":"accepted","ingredients":[{"name":"مسك أبيض","amount":12,"unit":"%"},{"name":"عود كمبودي","amount":3.5,"unit":"%"}]},{"id":"s2","code":"B","name":"مسك الليل ٢","ingredients":[]}]')$$, 'perfumer creates a named sample round (forging token and a decision)');
select pg_temp.denied($$insert into kit_orders(ref,email,samples) values ('SMP-BADNAM','x@x.sa','[{"id":"s1","name":""}]')$$, 'a sample needs a name');
select pg_temp.denied($$insert into kit_orders(ref,email) values ('XYZ-123456','x@x.sa')$$, 'unknown ref prefix rejected');
reset role;
select pg_temp.ok((select token <> 'guessme-guessme-1234' and length(token) = 32 and decided_at is null and not (samples -> 0 ? 'decision') and samples -> 0 ->> 'name' = 'مسك الليل ١' and kind = 'round' from kit_orders where ref='SMP-ROUND1'), 'server issues the token; a new round carries no client decisions');
select set_config('pp.tok', (select token from kit_orders where ref='SMP-ROUND1'), false);
-- حامل الرمز (من QR) يرى الورقة بلا دخول؛ بلا رمز لا شيء
set role anon;
select pg_temp.ok(kit_sheet('SMP-ROUND1', 'wrong-token-wrong-token') is null and kit_sheet('SMP-ROUND1', '') is null, 'no sheet without the right token');
select pg_temp.ok((kit_sheet('smp-round1', current_setting('pp.tok')) -> 'samples' -> 0 -> 'ingredients' -> 1 ->> 'name') = 'عود كمبودي' and not (kit_sheet('SMP-ROUND1', current_setting('pp.tok')) ? 'email') and not (kit_sheet('SMP-ROUND1', current_setting('pp.tok')) ? 'phone') and not (kit_sheet('SMP-ROUND1', current_setting('pp.tok')) ? 'token'), 'QR holder reads sample names and ingredients; no email, phone or token');
select pg_temp.ok(not (kit_track('SMP-ROUND1') ? 'samples'), 'public tracking by ref alone never shows the samples');
-- تأكيد عنوان الشحن قبل الشحن
select pg_temp.denied($$select kit_set_address('SMP-ROUND1', current_setting('pp.tok'), '{"street":"x"}')$$, 'address needs a city');
select pg_temp.allowed($$select kit_set_address('SMP-ROUND1', current_setting('pp.tok'), '{"country":"sa","city":"Jeddah","district":"الروضة","street":"شارع صاري","building":"12","postal":"23435","short_address":"jdra 2929","lat":"21.5433","lng":"39.1728","email":"hack@x.sa"}')$$, 'client confirms the delivery location from the QR page');
select pg_temp.denied($$select kit_decide('SMP-ROUND1', current_setting('pp.tok'), '[{"id":"s1","decision":"accepted"}]')$$, 'cannot rate samples before they ship');
reset role;
select pg_temp.ok((select city = 'Jeddah' and country = 'SA' and district = 'الروضة' and short_address = 'JDRA2929' and lat = 21.5433 and lng = 39.1728 and address_confirmed_at is not null and email = 'client@x.sa' from kit_orders where ref='SMP-ROUND1'), 'location saved with coordinates and national short address; email untouched');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update kit_orders set status='shipped', carrier='SMSA', tracking_no='290111' where ref='SMP-ROUND1'$$, 'round shipped');
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.denied($$select kit_set_address('SMP-ROUND1', current_setting('pp.tok'), '{"city":"Makkah"}')$$, 'address locked once shipped');
select pg_temp.allowed($$select kit_decide('SMP-ROUND1', current_setting('pp.tok'), '[{"id":"s1","decision":"accepted","comment":"هذه هي"},{"id":"s2","decision":"rejected","comment":"حادة"},{"id":"zz","decision":"accepted"},{"id":"s1x","decision":"maybe"}]')$$, 'client accepts one sample and rejects the other by name');
reset role;
select pg_temp.ok((select samples -> 0 ->> 'decision' = 'accepted' and samples -> 0 ->> 'comment' = 'هذه هي' and samples -> 1 ->> 'decision' = 'rejected' and jsonb_array_length(samples) = 2 and decided_at is not null and status = 'delivered' and delivered_at is not null from kit_orders where ref='SMP-ROUND1'), 'decisions recorded per sample; rating marks the round delivered');
select pg_temp.ok((select count(*) from tasks where title like 'راجع تقييم العميل لعينات SMP-ROUND1%مقبول 1، مرفوض 1%') = 1, 'the team gets a task to review the ratings');
-- الفريق يعدّل الأسماء والمكوّنات ولا يمس قرارات العميل ولا الرمز
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update kit_orders set token='stolen-token-stolen-0000', decided_at=null, samples='[{"id":"s1","code":"A","name":"مسك الليل — النسخة المعتمدة","decision":"rejected","comment":"زُوّر"},{"id":"s3","code":"C","name":"جديدة","decision":"accepted"}]' where ref='SMP-ROUND1'$$, 'perfumer edits the samples (trying to forge decisions and the token)');
reset role;
select pg_temp.ok((select token = current_setting('pp.tok') and decided_at is not null and samples -> 0 ->> 'name' like '%المعتمدة' and samples -> 0 ->> 'decision' = 'accepted' and samples -> 0 ->> 'comment' = 'هذه هي' and not (samples -> 1 ? 'decision') from kit_orders where ref='SMP-ROUND1'), 'names change; client decisions and the token stay as the client left them');
-- العميل المسجّل يرى جولته برمزها
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from kit_mine() x where x ->> 'ref' = 'SMP-ROUND1' and length(x ->> 'token') = 32) = 1, 'the signed-in client reads own round (with its token)');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.ok((select count(*) from kit_mine() x where x ->> 'ref' = 'SMP-ROUND1') = 0, 'another client cannot');
reset role;

-- ══ العقود: القيمة وجدول الدفعات والملف المرفوع وفاتورة كل دفعة ══
reset role;
-- عقد قديم بلا جدول مالي: بصمته لا تتغير بعد إضافة الحقول المالية
select pg_temp.ok((select content_hash = public.contract_hash(c) and total = 0 and schedule = '[]'::jsonb from project_contracts c where id='ffffffff-0000-0000-0000-000000000001'), 'older contracts keep their fingerprint (no finance fields in the hash)');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_contracts(id,project_id,title,company,client,sections,total,vat_rate,schedule) values ('ffffffff-0000-0000-0000-000000000002',(select project_id from project_contracts where id='ffffffff-0000-0000-0000-000000000001'),'عقد بجدول دفعات','{"name":"المصنع","idNumber":"1010","address":"الرياض"}','{"name":"نورة العميل","idLabel":"سجل","idNumber":"2020","address":"جدة"}','[{"title":"الموضوع","body":"تصنيع"}]',11500,15,'[{"id":"a","label":"دفعة مقدمة","percent":50,"due":"عند التوقيع"},{"id":"b","label":"بدء الإنتاج","percent":30,"due":""}]')$$, 'sales drafts a contract with a value and a partial schedule');
select pg_temp.denied($$update project_contracts set schedule='[{"id":"a","label":"x","percent":0}]' where id='ffffffff-0000-0000-0000-000000000002'$$, 'zero-percent installment rejected');
select pg_temp.denied($$update project_contracts set schedule='[{"id":"a","label":"x","percent":50},{"id":"a","label":"y","percent":50}]' where id='ffffffff-0000-0000-0000-000000000002'$$, 'duplicate installment ids rejected');
select pg_temp.denied($$update project_contracts set schedule='[{"id":"a","label":" ","percent":100}]' where id='ffffffff-0000-0000-0000-000000000002'$$, 'an installment needs a label');
select pg_temp.denied($$update project_contracts set total=-5 where id='ffffffff-0000-0000-0000-000000000002'$$, 'negative contract value rejected');
select pg_temp.denied($$update project_contracts set file='sb:projects/aaaaaaaa-0000-0000-0000-000000000003/c.pdf' where id='ffffffff-0000-0000-0000-000000000002'$$, 'contract file from another project rejected');
select pg_temp.denied($$select public.send_contract('ffffffff-0000-0000-0000-000000000002')$$, 'a schedule that is not 100% cannot be sent');
reset role;
select set_config('pp.h1', (select public.contract_hash(c) from project_contracts c where id='ffffffff-0000-0000-0000-000000000002'), false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$update project_contracts set schedule='[{"id":"a","label":"دفعة مقدمة","percent":50,"due":"عند التوقيع"},{"id":"b","label":"بدء الإنتاج","percent":30,"due":""},{"id":"c","label":"الدفعة النهائية","percent":20,"due":"قبل الشحن"}]' where id='ffffffff-0000-0000-0000-000000000002'$$, 'schedule completed to 100%');
reset role;
select pg_temp.ok(current_setting('pp.h1') <> (select public.contract_hash(c) from project_contracts c where id='ffffffff-0000-0000-0000-000000000002'), 'the schedule is part of the fingerprint');
select pg_temp.ok(public.contract_installment_amount(1000.01, '[{"id":"a","percent":33.33},{"id":"b","percent":33.33},{"id":"c","percent":33.34}]', 'c') = 333.41 and public.contract_installment_amount(11500, '[{"id":"a","percent":50},{"id":"b","percent":30},{"id":"c","percent":20}]', 'b') = 3450, 'installment amounts: the last takes the rounding remainder');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','TRX-1',current_date,'')$$, 'no payment on a draft contract');
select pg_temp.allowed($$select public.send_contract('ffffffff-0000-0000-0000-000000000002')$$, 'sales sends the contract with its schedule');
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','TRX-1',current_date,'')$$, 'no payment before the client signs');
select pg_temp.denied($$update project_contracts set total=1 where id='ffffffff-0000-0000-0000-000000000002'$$, 'value locked once sent');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok(public.sign_contract('ffffffff-0000-0000-0000-000000000002','client',(select 'sb:projects/'||project_id||'/sig2.png' from project_contracts where id='ffffffff-0000-0000-0000-000000000002'),'نورة العميل',(select content_hash from project_contracts where id='ffffffff-0000-0000-0000-000000000002')) = 'client_signed', 'client signs the value and schedule');
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','TRX-1',current_date,'')$$, 'the client cannot record a payment');
select pg_temp.denied($$insert into contract_payments(contract_id,project_id,installment_id,label,percent,amount,vat_rate,net_amount,vat_amount,method,invoice_no) select id,project_id,'a','x',50,1,15,1,0,'bank','INV-FAKE' from project_contracts where id='ffffffff-0000-0000-0000-000000000002'$$, 'no direct writes to payments');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','TRX-1',current_date,'')$$, 'production cannot record payments');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','zz','bank','',current_date,'')$$, 'unknown installment rejected');
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','crypto','',current_date,'')$$, 'unknown payment method rejected');
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','',current_date + 30,'')$$, 'a payment date far in the future is rejected');
select pg_temp.allowed($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','bank','TRX-1001',current_date,'تحويل الراجحي')$$, 'sales records the first installment');
select pg_temp.denied($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','a','cash','',current_date,'')$$, 'an installment is paid once');
select pg_temp.allowed($$select public.record_contract_payment('ffffffff-0000-0000-0000-000000000002','c','cash','',null,'')$$, 'installments can be settled in any order');
reset role;
select pg_temp.ok((select amount = 5750 and net_amount = 5000 and vat_amount = 750 and label = 'دفعة مقدمة' and invoice_no ~ '^INV-[0-9]{4}-[0-9]{5}$' and buyer ->> 'name' = 'نورة العميل' and seller ->> 'name' = 'المصنع' and recorded_by = '00000000-0000-0000-0000-00000000000c' from contract_payments where contract_id='ffffffff-0000-0000-0000-000000000002' and installment_id='a'), 'invoice: amount from the schedule, VAT carved out, parties snapshotted');
select pg_temp.ok((select max(right(invoice_no,5)::int) - min(right(invoice_no,5)::int) = 1 and sum(amount) = 8050 from contract_payments where contract_id='ffffffff-0000-0000-0000-000000000002'), 'invoice numbers are sequential');
select pg_temp.ok((select count(*) from project_comments where body like 'استلمنا دفعة «دفعة مقدمة»%INV-%') = 1 and (select count(*) from audit_log where action = 'contract.payment') = 2, 'payment posted to the project notes and audited');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from contract_payments) = 2, 'the client reads the invoices of own project');
delete from contract_payments;
update contract_payments set amount = 1;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.ok((select count(*) from contract_payments) = 0, 'production (no payments.view) sees no invoices');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from contract_payments) = 0, 'the designer sees no invoices');
reset role;
select pg_temp.ok((select count(*) = 2 and sum(amount) = 8050 from contract_payments), 'invoices can be neither deleted nor altered by the client');
-- عقد مرفوع كملف بلا بنود مكتوبة
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_contracts(id,project_id,title,sections,file,file_name) select 'ffffffff-0000-0000-0000-000000000003',project_id,'عقد مرفوع','[]','sb:projects/'||project_id||'/contract.pdf','عقد.pdf' from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'sales uploads a ready contract file');
select pg_temp.allowed($$select public.send_contract('ffffffff-0000-0000-0000-000000000003')$$, 'a file-only contract can be sent for signature');
select pg_temp.allowed($$insert into project_contracts(id,project_id,title,sections) select 'ffffffff-0000-0000-0000-000000000004',project_id,'عقد فارغ','[]' from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'empty draft saved');
select pg_temp.denied($$select public.send_contract('ffffffff-0000-0000-0000-000000000004')$$, 'a contract with neither clauses nor a file cannot be sent');
reset role;

-- ══ مرفقات الملاحظات ══
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$insert into project_comments(project_id,body,files) select project_id,'مرفقات',('[{"path":"sb:projects/'||project_id||'/logo.webp","name":"الشعار.webp","type":"image/webp","size":20480},{"path":"sb:projects/'||project_id||'/spec.docx","name":"المواصفات.docx","type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","size":51200}]')::jsonb from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'the client attaches an image and a document to a note');
select pg_temp.denied($$insert into project_comments(project_id,body,files) select project_id,'x','[{"path":"sb:projects/aaaaaaaa-0000-0000-0000-000000000003/secret.pdf","name":"a.pdf","type":"application/pdf","size":1}]' from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'an attachment from another project''s folder is rejected');
select pg_temp.denied($$insert into project_comments(project_id,body,files) select project_id,'x','[{"path":"https://evil.example/x.pdf","name":"a.pdf","type":"application/pdf","size":1}]' from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'external links are not attachments');
select pg_temp.denied($$insert into project_comments(project_id,body,files) select project_id,'x',(select jsonb_agg(jsonb_build_object('path','sb:projects/'||project_id||'/f'||g||'.pdf','name','f.pdf','type','application/pdf','size',1)) from generate_series(1,7) g) from project_contracts where id='ffffffff-0000-0000-0000-000000000001'$$, 'seven attachments on one note rejected');
reset role;
select pg_temp.ok((select jsonb_array_length(files) = 2 and from_client and files -> 1 ->> 'name' = 'المواصفات.docx' from project_comments where body = 'مرفقات' order by created_at desc limit 1), 'attachments stored with the note');

-- ══ عناوين العميل المحفوظة ══
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$insert into client_addresses(id,user_id,label,name,city,lat,lng,short_address) values ('abcdabcd-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','المكتب','نورة','Riyadh',24.7136,46.6753,'RRRD2929')$$, 'client saves an address (forging the owner)');
select pg_temp.allowed($$insert into client_addresses(id,label,city,is_default) values ('abcdabcd-0000-0000-0000-000000000002','المستودع','Jeddah',true)$$, 'second address made the default');
select pg_temp.denied($$insert into client_addresses(label,city) values ('x','  ')$$, 'an address needs a city');
select pg_temp.denied($$insert into client_addresses(label,city,short_address) values ('x','Riyadh','12AB')$$, 'malformed national short address rejected');
select pg_temp.denied($$insert into client_addresses(label,city,lat,lng) values ('x','Riyadh',95,10)$$, 'out-of-range coordinates rejected');
reset role;
select pg_temp.ok((select bool_and(user_id = '00000000-0000-0000-0000-00000000000f') and count(*) = 2 and count(*) filter (where is_default) = 1 from client_addresses) and (select is_default from client_addresses where id='abcdabcd-0000-0000-0000-000000000002'), 'addresses belong to their owner; exactly one default');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$update client_addresses set is_default = true where id='abcdabcd-0000-0000-0000-000000000001'$$, 'client switches the default');
select pg_temp.allowed($$insert into client_addresses(label,city) select 'عنوان '||g,'Riyadh' from generate_series(3,10) g$$, 'up to ten addresses');
select pg_temp.denied($$insert into client_addresses(label,city) values ('الحادي عشر','Riyadh')$$, 'the eleventh address is refused');
reset role;
select pg_temp.ok((select count(*) = 10 and count(*) filter (where is_default) = 1 from client_addresses) and (select is_default from client_addresses where id='abcdabcd-0000-0000-0000-000000000001'), 'ten addresses, still one default');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.ok((select count(*) from client_addresses) = 0, 'the designer cannot read client addresses');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from client_addresses) = 10, 'sales (crm.edit) reads them to prepare a shipment');
update client_addresses set city='X';
reset role;
select pg_temp.ok((select count(*) from client_addresses where city = 'X') = 0, 'but cannot change them');

-- ══ طلب عينة الاكتشاف يحمل العنوان التفصيلي والموقع ══
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.allowed($$insert into leads(kind,payload) values ('kit','{"email":"geo@brand.sa","order_ref":"KIT-GEO123","country":"SA","city":"Riyadh","district":"النرجس","street":"أنس بن مالك","building":"7421","postal":"13327","short_address":"rrrd 2929","lat":"24.830112","lng":"46.660145"}')$$, 'kit order with a detailed address and a map pin');
select pg_temp.allowed($$insert into leads(kind,payload) values ('kit','{"email":"bad@brand.sa","order_ref":"KIT-BAD123","city":"Riyadh","lat":"1e9","lng":"x","short_address":"nope"}')$$, 'kit order with garbage coordinates is still accepted');
reset role;
select pg_temp.ok((select district = 'النرجس' and building = '7421' and short_address = 'RRRD2929' and lat = 24.830112 and lng = 46.660145 and length(token) = 32 from kit_orders where ref='KIT-GEO123'), 'address parts and coordinates carried onto the shipment');
select pg_temp.ok((select lat is null and lng is null and short_address = '' from kit_orders where ref='KIT-BAD123'), 'garbage coordinates and short address dropped');

-- ══ العربون = الدفعة الأولى من العقد ══
reset role;
insert into projects (id, title, track, client_email, stage) values ('dededede-0000-0000-0000-000000000001','عطر الفجر','A','client@x.sa','brief');
create function pg_temp.new_deal(n text) returns void language plpgsql as $$
begin
  -- عرض: 1000 × 10 = 10,000 + ضريبة 1,500 = 11,500، عربون 50% = 5,750. وعقد مربوط به بدفعتين 50/50
  execute format($q$insert into project_quotes(id,project_id,lines,deposit_pct) values ('dededede-0000-0000-0000-0000000000%1$s','dededede-0000-0000-0000-000000000001','[{"label":"عطر 50 مل","qty":1000,"unit":10},{"label":"رسوم تصميم","qty":1,"unit":0}]',50)$q$, n);
  execute format($q$insert into project_contracts(id,project_id,quote_id,title,company,client,sections,specs,total,schedule) values ('dcdcdcdc-0000-0000-0000-0000000000%1$s','dededede-0000-0000-0000-000000000001','dededede-0000-0000-0000-0000000000%1$s','عقد %1$s','{"name":"المصنع"}','{"name":"نورة العميل"}','[{"title":"الموضوع","body":"تصنيع"}]','[{"name":"عطر 50 مل","qty":1000,"unit":"قطعة","images":[],"files":[]}]',11500,'[{"id":"a","label":"دفعة مقدمة","percent":50,"due":"عند التوقيع"},{"id":"b","label":"الدفعة النهائية","percent":50,"due":"","due_date":"2026-12-31"}]')$q$, n);
  perform public.send_quote(('dededede-0000-0000-0000-0000000000' || n)::uuid);
end $$;
create function pg_temp.client_signs(n text) returns text language sql as $$
  select public.sign_contract(('dcdcdcdc-0000-0000-0000-0000000000' || n)::uuid, 'client', 'sb:projects/dededede-0000-0000-0000-000000000001/sig.png', 'نورة العميل',
    (select content_hash from public.project_contracts where id = ('dcdcdcdc-0000-0000-0000-0000000000' || n)::uuid))
$$;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select pg_temp.new_deal('a1')$$, 'sales: quote sent and a contract drafted from it');
select pg_temp.allowed($$update project_contracts set schedule='[{"id":"a","label":"دفعة مقدمة","percent":40},{"id":"b","label":"الدفعة النهائية","percent":60}]' where id='dcdcdcdc-0000-0000-0000-0000000000a1'$$, 'schedule edited away from the deposit');
select pg_temp.denied($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000a1')$$, 'a contract whose first installment differs from the quote deposit cannot be sent');
select pg_temp.denied($$update project_contracts set schedule='[{"id":"a","label":"x","percent":50,"due_date":"31-12-2026"},{"id":"b","label":"y","percent":50}]' where id='dcdcdcdc-0000-0000-0000-0000000000a1'$$, 'malformed installment due date rejected');
select pg_temp.allowed($$update project_contracts set schedule='[{"id":"a","label":"دفعة مقدمة","percent":50,"due":"عند التوقيع"},{"id":"b","label":"الدفعة النهائية","percent":50,"due":"","due_date":"2026-12-31"}]' where id='dcdcdcdc-0000-0000-0000-0000000000a1'$$, 'first installment matched to the deposit (with a due date on the second)');
select pg_temp.allowed($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000a1')$$, 'now it sends');
-- (أ) يُدفع العربون أولاً ثم يوقّع العميل
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$select public.decide_quote('dededede-0000-0000-0000-0000000000a1','accepted','')$$, 'client approves the quote');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select public.mark_quote_paid('dededede-0000-0000-0000-0000000000a1','bank','TRX-A1',5750)$$, 'sales records the deposit by transfer');
reset role;
select pg_temp.ok((select count(*) from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000a1') = 0, 'nothing is invoiced before the contract is signed');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok(pg_temp.client_signs('a1') = 'client_signed', 'client signs');
reset role;
select pg_temp.ok((select installment_id = 'a' and amount = 5750 and source = 'deposit' and quote_id = 'dededede-0000-0000-0000-0000000000a1' and method = 'bank' and ref = 'TRX-A1' and note like 'من عربون عرض السعر QT-%' and invoice_no ~ '^INV-' from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000a1'), 'signing settles the first installment from the paid deposit, with its invoice');
select pg_temp.ok((select author_id is null and not from_client from project_comments where body like 'عربونك المدفوع سدّد «دفعة مقدمة»%' order by created_at desc limit 1), 'the system note is not attributed to the signing client');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.record_contract_payment('dcdcdcdc-0000-0000-0000-0000000000a1','a','bank','X',current_date,'')$$, 'the deposit cannot be charged a second time');
-- (ب) يوقّع العميل أولاً ثم يدفع العربون عبر بوابة الدفع (مفتاح الخدمة، بلا مستخدم)
select pg_temp.allowed($$select pg_temp.new_deal('b2')$$, 'second deal');
select pg_temp.allowed($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000b2')$$, 'contract sent');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$select public.decide_quote('dededede-0000-0000-0000-0000000000b2','accepted','')$$, 'client approves');
select pg_temp.ok(pg_temp.client_signs('b2') = 'client_signed', 'client signs before paying');
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((select count(*) from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000b2') = 0, 'still unpaid');
set role service_role;
select pg_temp.ok(public.record_deposit('dededede-0000-0000-0000-0000000000b2','pay_live_1',575000) = 'paid', 'gateway deposit recorded by the server function');
reset role;
select pg_temp.ok((select source = 'deposit' and method = 'online' and ref = 'pay_live_1' and amount = 5750 and recorded_by is null from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000b2'), 'the online deposit settles the first installment the moment it lands');
select pg_temp.ok((select count(*) from project_comments where body like 'عربونك المدفوع سدّد%' and author_id is null) = 2, 'system note written without a signed-in user');
-- (ج) يسجّل الفريق الدفعة الأولى على العقد: العرض يصير مدفوعاً
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select pg_temp.new_deal('c3')$$, 'third deal');
select pg_temp.allowed($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000c3')$$, 'contract sent');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$select public.decide_quote('dededede-0000-0000-0000-0000000000c3','accepted','')$$, 'client approves');
select pg_temp.ok(pg_temp.client_signs('c3') = 'client_signed', 'client signs');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select public.record_contract_payment('dcdcdcdc-0000-0000-0000-0000000000c3','a','cash','REC-7',current_date,'')$$, 'sales records the first installment in cash');
reset role;
select pg_temp.ok((select status = 'paid' and paid_amount = 5750 and payment_method = 'cash' and payment_ref = 'REC-7' from project_quotes where id='dededede-0000-0000-0000-0000000000c3'), 'the linked quote becomes paid: the client is not asked for the deposit again');
select pg_temp.ok((select count(*) = 1 and bool_and(quote_id = 'dededede-0000-0000-0000-0000000000c3') from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000c3'), 'exactly one invoice for that money');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.mark_quote_paid('dededede-0000-0000-0000-0000000000c3','bank','X',5750)$$, 'the deposit cannot be recorded again on the quote');
-- (د) تحويل أكبر من العربون: لا تخمين
select pg_temp.allowed($$select pg_temp.new_deal('d4')$$, 'fourth deal');
select pg_temp.allowed($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000d4')$$, 'contract sent');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.allowed($$select public.decide_quote('dededede-0000-0000-0000-0000000000d4','accepted','')$$, 'client approves');
select pg_temp.ok(pg_temp.client_signs('d4') = 'client_signed', 'client signs');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$select public.mark_quote_paid('dededede-0000-0000-0000-0000000000d4','bank','TRX-BIG',8000)$$, 'client transferred more than the deposit');
reset role;
select pg_temp.ok((select count(*) from contract_payments where contract_id='dcdcdcdc-0000-0000-0000-0000000000d4') = 0 and (select count(*) from tasks where title like 'العربون المدفوع (8000%لا يطابق الدفعة الأولى (5750%') = 1, 'a mismatched amount is not auto-invoiced; the team gets one task to settle it');

-- ══ مفتاح الإفصاح، اعتماد التركيبة، وأمر الإنتاج ══
insert into projects (id, title, track, client_email, stage) values ('dfdfdfdf-0000-0000-0000-000000000001','مسك الليل','A','client@x.sa','formula');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$insert into kit_orders(ref,kind,email,name,city,project_id,approved_sample,samples) values ('SMP-FORM01','round','client@x.sa','نورة','Riyadh','dfdfdfdf-0000-0000-0000-000000000001','s1','[{"id":"s1","code":"A","name":"مسك الليل ١","concentration":"EDP 18%","ingredients":[{"name":"مسك أبيض","amount":12,"unit":"%"},{"name":"عود","amount":3.5,"unit":"%"}]},{"id":"s2","code":"B","name":"مسك الليل ٢","ingredients":[{"name":"ورد","amount":5,"unit":"%"}]}]')$$, 'perfumer creates a round for the project (forging an approval)');
select pg_temp.denied($$update kit_orders set disclosure='everyone' where ref='SMP-FORM01'$$, 'unknown disclosure level rejected');
reset role;
select pg_temp.ok((select disclosure = 'contract' and approved_sample is null from kit_orders where ref='SMP-FORM01'), 'default: names now, amounts after the contract; no forged approval');
select set_config('pp.ftok', (select token from kit_orders where ref='SMP-FORM01'), false);
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.ok((kit_sheet('SMP-FORM01', current_setting('pp.ftok')) -> 'samples' -> 0 -> 'ingredients' -> 0 ->> 'name') = 'مسك أبيض' and not ((kit_sheet('SMP-FORM01', current_setting('pp.ftok')) -> 'samples' -> 0 -> 'ingredients' -> 0) ? 'amount') and (kit_sheet('SMP-FORM01', current_setting('pp.ftok')) ->> 'amounts') = 'false', 'before the contract the client sees ingredient names without amounts');
reset role;
update kit_orders set disclosure='hidden' where ref='SMP-FORM01';
select pg_temp.ok(not ((kit_sheet('SMP-FORM01', current_setting('pp.ftok')) -> 'samples' -> 0) ? 'ingredients') and (kit_sheet('SMP-FORM01', current_setting('pp.ftok')) -> 'samples' -> 0 ->> 'name') = 'مسك الليل ١', 'hidden: name only');
update kit_orders set disclosure='full' where ref='SMP-FORM01';
select pg_temp.ok((kit_sheet('SMP-FORM01', current_setting('pp.ftok')) -> 'samples' -> 0 -> 'ingredients' -> 1 ->> 'amount') = '3.5', 'full: amounts shown');
update kit_orders set disclosure='contract', note='هامش 60%' where ref='SMP-FORM01';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from kit_orders) = 0, 'the client cannot read the shipments table directly (it holds the amounts and the internal note)');
select pg_temp.ok((select not (x ? 'note') and not ((x -> 'samples' -> 0 -> 'ingredients' -> 0) ? 'amount') and (x ->> 'amounts') = 'false' and length(x ->> 'token') = 32 from kit_mine() x where x ->> 'ref' = 'SMP-FORM01'), 'kit_mine gives the client view: no note, no amounts, with the token');
-- الشحن والتقييم ثم الاعتماد
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$update kit_orders set status='shipped', carrier='SMSA' where ref='SMP-FORM01'$$, 'shipped');
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.denied($$select kit_approve('SMP-FORM01', current_setting('pp.ftok'), 's1')$$, 'cannot approve a sample that was not accepted');
select pg_temp.allowed($$select kit_decide('SMP-FORM01', current_setting('pp.ftok'), '[{"id":"s1","decision":"accepted"},{"id":"s2","decision":"rejected"}]')$$, 'client rates both');
select pg_temp.denied($$select kit_approve('SMP-FORM01', current_setting('pp.ftok'), 's2')$$, 'cannot approve a rejected sample');
select pg_temp.denied($$select kit_approve('SMP-FORM01', 'wrong-token-wrong-token', 's1')$$, 'approval needs the sheet token');
select pg_temp.allowed($$select kit_approve('SMP-FORM01', current_setting('pp.ftok'), 's1')$$, 'client approves the accepted sample as the final formula');
reset role;
select pg_temp.ok((select approved_sample = 's1' and approved_at is not null from kit_orders where ref='SMP-FORM01'), 'approval recorded on the shipment');
select pg_temp.ok((select stage = 'identity' and formula ->> 'name' = 'مسك الليل ١' and formula ->> 'by' = 'client' and formula ->> 'ref' = 'SMP-FORM01' and not (formula ? 'ingredients') from projects where id='dfdfdfdf-0000-0000-0000-000000000001'), 'the project gets the formula summary (no ingredients) and leaves the sampling stage');
select pg_temp.ok((select jsonb_array_length(ingredients) = 2 and ingredients -> 0 ->> 'amount' = '12' and approved_by = 'client' from project_formulas where project_id='dfdfdfdf-0000-0000-0000-000000000001'), 'the full formula is stored for the team');
select pg_temp.ok((select count(*) from project_comments where project_id='dfdfdfdf-0000-0000-0000-000000000001' and body like 'اعتمد العميل العينة A · «مسك الليل ١»%' and author_id is null) = 1 and (select count(*) from tasks where title like 'تركيبة معتمدة لمشروع «مسك الليل»%') = 1, 'a system note and a team task follow');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from project_formulas) = 0 and (select formula ->> 'name' from projects where id='dfdfdfdf-0000-0000-0000-000000000001') = 'مسك الليل ١', 'the client sees the formula name, never the ingredient table');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from project_formulas where project_id='dfdfdfdf-0000-0000-0000-000000000001') = 1, 'the team reads it');
select pg_temp.denied($$insert into project_formulas(project_id,kit_ref,sample_id,name,approved_by) values ('dededede-0000-0000-0000-000000000001','X','s','x','team')$$, 'no direct writes to formulas');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
update kit_orders set approved_sample='s2' where ref='SMP-FORM01';
select pg_temp.denied($$select public.set_project_formula((select id from kit_orders where ref='SMP-FORM01'), 's2')$$, 'the team cannot set a sample the client rejected');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.denied($$select public.set_project_formula((select id from kit_orders where ref='KIT-7F3K9Q' limit 1), 's1')$$, 'the designer cannot set formulas');
reset role;
select pg_temp.ok((select approved_sample = 's1' from kit_orders where ref='SMP-FORM01'), 'a direct update cannot change the approved sample');
-- أمر الإنتاج يحمل لقطة التركيبة
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$insert into production_orders(id,ref,batch_no,project_id,project_title,product,qty,fill_ml,steps,formula) values ('cdcdcdcd-0000-0000-0000-0000000000f1','x','x','dfdfdfdf-0000-0000-0000-000000000001','مسك الليل','مسك EDP 50 مل',1000,50,'[{"id":"materials","done":false}]','{"name":"مزوّرة"}')$$, 'production order for the project (forging a formula)');
select pg_temp.allowed($$update production_orders set formula='{"name":"عُدّلت"}', note='ملاحظة' where id='cdcdcdcd-0000-0000-0000-0000000000f1'$$, 'later update');
select pg_temp.allowed($$insert into production_orders(id,ref,batch_no,project_id,product,qty,fill_ml,steps) values ('cdcdcdcd-0000-0000-0000-0000000000f2','y','y','dededede-0000-0000-0000-000000000001','بلا تركيبة',10,50,'[{"id":"materials","done":false}]')$$, 'order for a project without an approved formula');
reset role;
select pg_temp.ok((select formula ->> 'name' = 'مسك الليل ١' and jsonb_array_length(formula -> 'ingredients') = 2 and formula ->> 'kit_ref' = 'SMP-FORM01' and formula_ref = 'SMP-FORM01 · A · مسك الليل ١' and note = 'ملاحظة' from production_orders where id='cdcdcdcd-0000-0000-0000-0000000000f1'), 'the order carries a fixed snapshot of the approved formula and its reference');
select pg_temp.ok((select formula is null and formula_ref = '' from production_orders where id='cdcdcdcd-0000-0000-0000-0000000000f2'), 'no formula, no snapshot');
-- توقيع العقد يكشف الكميات (disclosure = contract)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.allowed($$insert into project_contracts(id,project_id,title,sections) values ('dcdcdcdc-0000-0000-0000-0000000000f1','dfdfdfdf-0000-0000-0000-000000000001','عقد مسك','[{"title":"الموضوع","body":"تصنيع"}]')$$, 'contract for the formula project');
select pg_temp.allowed($$select public.send_contract('dcdcdcdc-0000-0000-0000-0000000000f1')$$, 'sent');
reset role;
select pg_temp.ok((kit_sheet('SMP-FORM01', current_setting('pp.ftok')) ->> 'amounts') = 'false', 'a sent but unsigned contract reveals nothing');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok(public.sign_contract('dcdcdcdc-0000-0000-0000-0000000000f1','client','sb:projects/dfdfdfdf-0000-0000-0000-000000000001/sig.png','نورة العميل',(select content_hash from project_contracts where id='dcdcdcdc-0000-0000-0000-0000000000f1')) = 'client_signed', 'client signs the project contract');
select pg_temp.ok((select (x -> 'samples' -> 0 -> 'ingredients' -> 0 ->> 'amount') = '12' and (x ->> 'amounts') = 'true' from kit_mine() x where x ->> 'ref' = 'SMP-FORM01'), 'after signing, the amounts appear automatically');
reset role;
-- المسؤول يثبّت تركيبة (اعتماد هاتفي)
update kit_orders set samples = samples || '[{"id":"s3","code":"C","name":"مسك الليل ٣","ingredients":[]}]'::jsonb where ref='SMP-FORM01';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select pg_temp.allowed($$select public.set_project_formula((select id from kit_orders where ref='SMP-FORM01'), 's3')$$, 'the perfumer sets an unrated sample as the formula');
reset role;
select pg_temp.ok((select name = 'مسك الليل ٣' and approved_by = 'team' from project_formulas where project_id='dfdfdfdf-0000-0000-0000-000000000001') and (select stage = 'identity' from projects where id='dfdfdfdf-0000-0000-0000-000000000001') and (select formula ->> 'name' = 'مسك الليل ١' from production_orders where id='cdcdcdcd-0000-0000-0000-0000000000f1'), 'formula replaced; the stage does not move again; the existing order keeps its snapshot');

-- ══ إعادة الطلب بنقرة ══
update project_formulas set project_id = project_id where false;
insert into project_formulas (project_id, kit_ref, sample_id, code, name, ingredients, approved_by) values ('dededede-0000-0000-0000-000000000001','SMP-FORM01','s1','A','مسك الفجر','[{"name":"مسك","amount":10,"unit":"%"}]','team');
update projects set formula = '{"ref":"SMP-FORM01","sample_id":"s1","code":"A","name":"مسك الفجر","by":"team"}' where id='dededede-0000-0000-0000-000000000001';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',false);
select pg_temp.denied($$select public.reorder_project('dededede-0000-0000-0000-000000000001', 2500, null, '')$$, 'a stranger cannot reorder someone else''s project');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.denied($$select public.reorder_project('dededede-0000-0000-0000-000000000001', 0, null, '')$$, 'zero quantity rejected');
select pg_temp.denied($$select public.reorder_project('dededede-0000-0000-0000-000000000001', 2500, current_date - 1, '')$$, 'a past delivery date rejected');
select set_config('pp.re1', public.reorder_project('dededede-0000-0000-0000-000000000001', 2500, current_date + 60, 'نفس العلبة بلون أغمق')::text, false);
select pg_temp.ok((select title = 'عطر الفجر · إعادة طلب 1' and reorder_of = 'dededede-0000-0000-0000-000000000001' and stage = 'production' and client_id = '00000000-0000-0000-0000-00000000000f' and due_date = current_date + 60 and formula ->> 'name' = 'مسك الفجر' and brief ->> 'reorder_qty' = '2500' from projects where id = current_setting('pp.re1')::uuid), 'the client gets a new linked project, starting at production, with the formula');
select pg_temp.ok((select count(*) from project_quotes where project_id = current_setting('pp.re1')::uuid) = 0 and (select count(*) from project_contracts where project_id = current_setting('pp.re1')::uuid) = 0, 'the drafts stay hidden from the client until sent');
select pg_temp.ok((select count(*) from project_comments where project_id = current_setting('pp.re1')::uuid and from_client and body like 'طلب إعادة لمشروع «عطر الفجر» · الكمية 2,500%نفس العلبة%') = 1, 'the request is posted as the client''s note');
reset role;
select pg_temp.ok((select status = 'draft' and lines -> 0 ->> 'qty' = '2500' and lines -> 1 ->> 'qty' = '1' and subtotal = 25000 and total = 28750 and deposit = 14375 and notes like 'إعادة طلب من QT-%' from project_quotes where project_id = current_setting('pp.re1')::uuid), 'draft quote at the new quantity; the one-off line is left for the team');
select pg_temp.ok((select status = 'draft' and quote_id = (select id from project_quotes where project_id = current_setting('pp.re1')::uuid) and total = 28750 and specs -> 0 ->> 'qty' = '2500' and public.contract_first_amount(c) = 14375 and not (schedule -> 1 ? 'due_date') and client_signature is null and title like '% · إعادة طلب 1' from project_contracts c where project_id = current_setting('pp.re1')::uuid), 'draft contract: same clauses, new quantity, first installment equal to the new deposit, old due dates dropped');
select pg_temp.ok((select name = 'مسك الفجر' from project_formulas where project_id = current_setting('pp.re1')::uuid) and (select count(*) from tasks where title like 'إعادة طلب «عطر الفجر» (2,500)%') = 1, 'the full formula is copied and the owner gets a task');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.reorder_project('aaaaaaaa-0000-0000-0000-000000000002', null, null, '')$$, 'a project with nothing contracted is not eligible');
select pg_temp.allowed($$select public.send_contract((select id from project_contracts where project_id = current_setting('pp.re1')::uuid))$$, 'the team can send the cloned contract as is');
select pg_temp.allowed($$select public.reorder_project('dededede-0000-0000-0000-000000000001', null, null, '')$$, 'the team reorders for the client (same quantities)');
reset role;
select pg_temp.ok((select title = 'عطر الفجر · إعادة طلب 2' from projects where reorder_of = 'dededede-0000-0000-0000-000000000001' order by created_at desc limit 1) and (select lines -> 0 ->> 'qty' = '1000' from project_quotes where project_id = (select id from projects where reorder_of = 'dededede-0000-0000-0000-000000000001' order by created_at desc limit 1)), 'second reorder numbered 2, quantities unchanged');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.denied($$select public.reorder_project('dededede-0000-0000-0000-000000000001', null, null, '')$$, 'two unpriced reorders are the limit');
reset role;

-- ══ سجل التذكيرات ══
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.denied($$select public.reminder_claim('[{"key":"quote_pending:x:1","kind":"quote_pending","audience":"client"}]')$$, 'signed-in users cannot claim reminders');
select pg_temp.denied($$insert into reminder_log(key,kind,audience) values ('forged:1:1','x','client')$$, 'nor write the log');
reset role; select set_config('request.jwt.claim.sub','',false);
set role service_role;
select pg_temp.ok((select count(*) from public.reminder_claim('[{"key":"quote_pending:q1:1","kind":"quote_pending","audience":"client","project_id":"dededede-0000-0000-0000-000000000001","subject":"عرض بانتظار ردك"},{"key":"installment_overdue_team:c1:a:1","kind":"installment_overdue_team","audience":"team","project_id":"","subject":"تحصيل"},{"key":"gone:1:1","kind":"quote_pending","audience":"client","project_id":"99999999-0000-0000-0000-000000000009","subject":"مشروع محذوف"}]')) = 2, 'the server claims new keys (a deleted project is skipped)');
select pg_temp.ok((select count(*) from public.reminder_claim('[{"key":"quote_pending:q1:1","kind":"quote_pending","audience":"client","project_id":"dededede-0000-0000-0000-000000000001","subject":"عرض بانتظار ردك"},{"key":"quote_pending:q1:2","kind":"quote_pending","audience":"client","project_id":"dededede-0000-0000-0000-000000000001","subject":"تذكير"}]')) = 1, 'an attempt already claimed is never sent twice; the next attempt is new');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.ok((select count(*) from reminder_log) = 3, 'the team sees what was sent');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false);
select pg_temp.ok((select count(*) from reminder_log) = 0, 'clients do not');
reset role;

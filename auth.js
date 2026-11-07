/* StudyPilot account UI and per-user cloud storage. Data access is additionally restricted by Supabase RLS. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cfg = window.STUDYPILOT_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(String(cfg.SUPABASE_URL || '')) && String(cfg.SUPABASE_PUBLIC_KEY || '').length > 20 && !String(cfg.SUPABASE_URL).includes('PASTE_') && !String(cfg.SUPABASE_PUBLIC_KEY).includes('PASTE_');
  let client = null, currentUser = null, authMode = 'signin', syncTimer = null, isApplyingCloud = false;
  const dialog = $('#accountDialog');
  function msg(text, error=false){const el=$('#authMessage'); if(el){el.textContent=text;el.classList.toggle('error',error)}}
  function setSaveLabel(text, error=false){const el=$('#saveState');if(el){el.textContent=text;el.dataset.state=/loading|syncing/i.test(text)?'busy':'idle';el.classList.toggle('save-error',error)}}
  function showDialog(){if(!dialog.open)dialog.showModal();renderAccount()}
  function setMode(mode){authMode=mode;$('#accountSignedOut').hidden=false;$('#accountSignedIn').hidden=true;$('#accountNameField').hidden=mode!=='signup';$('#accountDialogTitle').textContent=mode==='signup'?'Create your student account':'Sign in to StudyPilot';$('#accountDialogDescription').textContent=mode==='signup'?'Create one account to keep your revision plan private and available across devices.':'Your revision plan follows your account across devices.';$('#authSubmit').textContent=mode==='signup'?'Create account':'Sign in';$('#authToggleMode').textContent=mode==='signup'?'I already have an account':'Create a student account';$('#authForgotPassword').hidden=mode==='signup';msg('')}
  function initials(name){return String(name||'Student').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'SP'}
  function setAvatar(el, avatar, name){if(!el)return;el.replaceChildren();if(typeof avatar==='string'&&avatar.startsWith('data:image/')){const img=document.createElement('img');img.className='avatar-image';img.alt='';img.src=avatar;el.appendChild(img)}else el.textContent=initials(name)}
  function renderAccount(){const data=window.StudyPilot?.getData?.()||{profile:{}};const p=data.profile||{};const displayName=p.name||currentUser?.user_metadata?.full_name||currentUser?.email?.split('@')[0]||'Student';setAvatar($('#accountAvatar'),p.avatar,displayName);$('#accountName').textContent=currentUser?displayName:'Sign in';$('#accountCaption').textContent=currentUser?(currentUser.email||'Account connected'):'Sync your study data';$('#settingsAccountStatus').textContent=currentUser?`Signed in as ${currentUser.email}. Cloud sync is enabled.`:(configured?'Not signed in. Sign in to sync your study data.':'Site configuration is incomplete.');$('#signedInName').textContent=displayName;$('#signedInEmail').textContent=currentUser?.email||'';$('#signedInSyncStatus').textContent=currentUser?'Your study data is stored in your private account.':'Cloud sync is not connected.';setAvatar($('#dialogAvatarPreview'),p.avatar,displayName);if(currentUser){$('#accountSignedOut').hidden=true;$('#accountSignedIn').hidden=false;$('#accountDialogTitle').textContent='Your account';$('#accountDialogDescription').textContent='Your account and private study data.';msg('')}else{setMode(authMode)} }
  async function syncNow(snapshot){if(!client||!currentUser||isApplyingCloud)return;try{setSaveLabel('Syncing…');const payload={user_id:currentUser.id,data:snapshot,updated_at:new Date().toISOString()};const {error}=await client.from('studypilot_user_data').upsert(payload,{onConflict:'user_id'});if(error)throw error;setSaveLabel('Saved to cloud');$('#signedInSyncStatus').textContent='Your study data is synced securely.';$('#settingsAccountStatus').textContent=`Signed in as ${currentUser.email}. Cloud sync is up to date.`}catch(e){console.error('StudyPilot cloud save failed',e);setSaveLabel('Cloud save failed',true);$('#signedInSyncStatus').textContent='Cloud save failed. Your planner is only in memory until cloud saving succeeds.';$('#settingsAccountStatus').textContent='Cloud save failed: '+(e.message||'Check the database table and RLS policies.');msg('Cloud save failed. Your changes are not saved. Check the database setup and try again.',true)}}
  function scheduleSync(snapshot){if(!client||!currentUser||isApplyingCloud)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(snapshot),700)}
  async function loadStudentData(user){currentUser=user;clearTimeout(syncTimer);isApplyingCloud=true;window.StudyPilot.replaceData(window.StudyPilot.freshData());isApplyingCloud=false;renderAccount();try{setSaveLabel('Loading cloud…');const {data:row,error}=await client.from('studypilot_user_data').select('data').eq('user_id',user.id).maybeSingle();if(error)throw error;isApplyingCloud=true;if(row&&row.data&&typeof row.data==='object'){window.StudyPilot.replaceData(row.data)}else{
      // A new account must never inherit data left in the page by another account.
      // Do not offer browser-data migration: start with a clean planner for this user.
      const fresh=window.StudyPilot.freshData();
      fresh.profile.name=user.user_metadata?.full_name||user.email?.split('@')[0]||'Student';
      window.StudyPilot.replaceData(fresh);
    }isApplyingCloud=false;await syncNow(window.StudyPilot.getData());renderAccount();if(dialog.open)renderAccount();await refreshCentralSubjectChoices()}catch(e){isApplyingCloud=false;console.error('StudyPilot cloud load failed',e);setSaveLabel('Cloud connection error',true);msg('We could not load your study data. Please try again shortly or contact support.',true);$('#settingsAccountStatus').textContent='Cloud data could not be loaded. Please contact support if this continues.';renderAccount()}}
  async function signOut(){if(!client)return;const {error}=await client.auth.signOut();if(error){console.error('StudyPilot sign-out failed',error);msg('We could not sign out. Please try again.',true);return}currentUser=null;isApplyingCloud=true;window.StudyPilot.replaceData(window.StudyPilot.freshData());isApplyingCloud=false;renderAccount();msg('You have signed out. Your cloud copy remains saved; this screen has been cleared.');setSaveLabel('Sign in to save');dialog.close()}
  async function submitAuth(e){e.preventDefault();if(!client){msg('StudyPilot has not been configured by the site administrator yet. Please try again later.',true);return}const email=$('#authEmail').value.trim(),password=$('#authPassword').value;$('#authSubmit').disabled=true;msg(authMode==='signup'?'Creating account…':'Signing in…');try{let result;if(authMode==='signup'){const full_name=$('#authDisplayName').value.trim();result=await client.auth.signUp({email,password,options:{data:{full_name}}})}else result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(authMode==='signup'&&!result.data.session){msg('Account created. Check your email to confirm your address, then return here to sign in.');return}if(result.data.user){await loadStudentData(result.data.user);if(result.data.session){msg('You are signed in. Your personal study data is connected.');dialog.close()}}}catch(err){console.error('StudyPilot authentication failed',err);msg('We could not complete sign-in. Check your details and try again.',true)}finally{$('#authSubmit').disabled=false}}
  async function forgotPassword(){if(!client){msg('Site configuration is incomplete.',true);return}const email=$('#authEmail').value.trim();if(!email){msg('Enter your email address first, then choose Forgot password.',true);return}try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.href.split('#')[0]});if(error)throw error;msg('If the address is registered, a password-reset email will arrive shortly.')}catch(e){console.error('StudyPilot password reset failed',e);msg('We could not request a password reset. Please try again later.',true)}}
  window.StudyPilotAuth={
    isSignedIn:()=>Boolean(currentUser),
    submitFeedback:async({category,rating,message})=>{
      if(!client||!currentUser)throw new Error('Sign in to send feedback.');
      const {error}=await client.from('studypilot_feedback').insert({user_id:currentUser.id,category,rating:rating?Number(rating):null,message});
      if(error){console.error('StudyPilot feedback submission failed',error);throw new Error('We could not send your feedback. Please try again later.')}
    },
    reportProblem:async(message)=>{
      if(!client||!currentUser)throw new Error('Sign in to send a problem report.');
      const {error}=await client.from('studypilot_support_reports').insert({user_id:currentUser.id,category:'student_report',user_message:message,diagnostic_code:'student_reported_issue',app_version:'4.0',page_name:document.querySelector('.page.active')?.id||'unknown'});
      if(error){console.error('StudyPilot support report failed',error);throw new Error('We could not send your report. Please try again later.')}
    },
    listPublishedSubjects:async(level)=>{
      if(!client||!currentUser)throw new Error('Sign in to view the official curriculum.');
      const {data,error}=await client.from('curriculum_subjects').select('id,name,level').eq('curriculum','UACE').eq('level',level).eq('is_published',true).order('display_order').order('name');
      if(error)throw error;return data||[];
    },
    saveSelectedSubjects:async(ids,level)=>{
      if(!client||!currentUser)throw new Error('Sign in to save your subjects.');
      const {error:delError}=await client.from('student_subjects').delete().eq('user_id',currentUser.id);
      if(delError)throw delError;
      if(ids.length){const {error}=await client.from('student_subjects').insert(ids.map(subject_id=>({user_id:currentUser.id,subject_id})));if(error)throw error}
      let subjects=[];
      if(ids.length){const {data,error}=await client.from('curriculum_subjects').select('id,name,level').in('id',ids);if(error)throw error;subjects=data||[]}
      const subjectIds=(subjects||[]).map(s=>s.id);
      let official=[];
      if(subjectIds.length){
        const {data:topics,error:te}=await client.from('curriculum_topics').select('id,subject_id,name,term').in('subject_id',subjectIds).order('display_order');if(te)throw te;
        const topicMap=new Map((topics||[]).map(t=>[t.id,t]));
        const topicIds=[...topicMap.keys()];
        let subs=[];
        if(topicIds.length){const {data,error:se}=await client.from('curriculum_subtopics').select('id,topic_id,name').in('topic_id',topicIds).order('display_order');if(error)throw error;subs=data||[]}
        const subMap=new Map(subs.map(st=>[st.id,st]));
        const subIds=[...subMap.keys()];
        let concepts=[];
        if(subIds.length){const {data,error:ce}=await client.from('curriculum_concepts').select('*').in('subtopic_id',subIds).order('display_order');if(ce)throw ce;concepts=data||[]}
        const subjectMap=new Map((subjects||[]).map(s=>[s.id,s]));
        official=concepts.map(c=>{const st=subMap.get(c.subtopic_id),t=topicMap.get(st?.topic_id),sub=subjectMap.get(t?.subject_id);return{id:c.id,subject:sub?.name||'Other',paper:t?.term||'',topic:t?.name||'',subtopic:st?.name||'',name:c.name,description:c.description||'',type:'mixed',difficulty:c.difficulty,importance:c.importance,learnMin:c.learn_minutes,reviewMin:c.review_minutes,practiceMin:c.practice_minutes,targetReps:c.target_repetitions,targetQuestions:c.target_questions,centralCurriculum:true}}).filter(c=>c.name&&c.subject)
      }
      const current=window.StudyPilot.getData();
      const selectedNames=(subjects||[]).map(s=>s.name);
      const legacy=current.concepts.filter(c=>!c.centralCurriculum);
      const keys=new Set(legacy.map(c=>[c.subject,c.topic,c.subtopic,c.name].join('|').toLowerCase()));
      const merged=[...legacy,...official.filter(c=>!keys.has([c.subject,c.topic,c.subtopic,c.name].join('|').toLowerCase()))];
      const next={...current,subjects:[...new Set([...current.subjects.filter(s=>!current.concepts.some(c=>c.centralCurriculum&&c.subject===s)),...selectedNames])],concepts:merged};
      next.profile={...next.profile,level:level,subjectOrder:[...new Set([...selectedNames,...(next.profile.subjectOrder||[])])]};
      window.StudyPilot.replaceData(next);
      return {subjects:selectedNames,concepts:official.length};
    }
  };
  async function refreshCentralSubjectChoices(){
    const box=$('#centralSubjectChoices');if(!box)return;
    if(!currentUser){box.textContent='Sign in to choose published subjects.';return}
    const selector=$('#centralCurriculumLevel');
    const profileLevel=window.StudyPilot.getData().profile.level;
    if(selector&&selector.dataset.initialized!=='true'){if(['Senior Five','Senior Six'].includes(profileLevel))selector.value=profileLevel;selector.dataset.initialized='true'}
    const level=selector?.value||'Senior Five';
    try{
      const {data,error}=await client.from('curriculum_subjects').select('id,name').eq('curriculum','UACE').eq('level',level).eq('is_published',true).order('display_order').order('name');
      if(error)throw error;
      const {data:selected,error:se}=await client.from('student_subjects').select('subject_id').eq('user_id',currentUser.id);if(se)throw se;
      const chosen=new Set((selected||[]).map(x=>x.subject_id));
      box.innerHTML=data.length?data.map(s=>`<label class="check-row"><input type="checkbox" name="centralSubject" value="${s.id}" ${chosen.has(s.id)?'checked':''}> ${String(s.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</label>`).join(''):'No published subjects are available for this level yet.';
    }catch(e){console.error('StudyPilot curriculum list failed',e);box.textContent='Could not load published subjects. Please try again later.'}
  }
  function bind(){
    $('#centralCurriculumLevel')?.addEventListener('change',refreshCentralSubjectChoices);
    $('#centralCurriculumForm')?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]'),msgEl=$('#centralCurriculumMessage');if(!currentUser){msgEl.textContent='Sign in before selecting subjects.';return}const ids=Array.from(e.currentTarget.querySelectorAll('input[name="centralSubject"]:checked')).map(x=>x.value);btn.disabled=true;msgEl.textContent='Saving your subjects and loading the curriculum…';try{const level=$('#centralCurriculumLevel').value,result=await window.StudyPilotAuth.saveSelectedSubjects(ids,level);msgEl.textContent=`Loaded ${result.concepts} official concepts across ${result.subjects.length} selected subjects. Your existing study history was preserved.`}catch(err){console.error('StudyPilot curriculum load failed',err);msgEl.textContent='We could not load the curriculum. Please try again later.'}finally{btn.disabled=false}});
    $('#accountTrigger').addEventListener('click',showDialog);$('#openAccountSettings').addEventListener('click',showDialog);$('#closeAccount').addEventListener('click',()=>dialog.close());$('#accountForm').addEventListener('submit',submitAuth);$('#authToggleMode').addEventListener('click',()=>setMode(authMode==='signup'?'signin':'signup'));$('#authForgotPassword').addEventListener('click',forgotPassword);$('#authSignOut').addEventListener('click',signOut);
    $('#studentFeedbackForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,btn=f.querySelector('button[type="submit"]'),d=new FormData(f);btn.disabled=true;try{await window.StudyPilotAuth.submitFeedback({category:d.get('category'),rating:d.get('rating'),message:d.get('message').trim()});f.reset();$('#feedbackFormMessage').textContent='Thank you. Your feedback has been sent.'}catch(err){$('#feedbackFormMessage').textContent=err.message}finally{btn.disabled=false}});
    $('#studentSupportForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,btn=f.querySelector('button[type="submit"]'),message=new FormData(f).get('message').trim();btn.disabled=true;try{await window.StudyPilotAuth.reportProblem(message);f.reset();$('#supportFormMessage').textContent='Your problem report has been sent. Thank you.'}catch(err){$('#supportFormMessage').textContent=err.message}finally{btn.disabled=false}});
    $('#goToProfile').addEventListener('click',()=>{dialog.close();window.StudyPilot.go('settings');document.querySelector('#profileForm input[name="name"]').focus()});
    window.addEventListener('studypilot:data-saved',e=>{renderAccount();if(!isApplyingCloud)scheduleSync(e.detail.data)});
  }
  bind();
  if(configured&&window.supabase?.createClient){try{client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLIC_KEY);client.auth.getSession().then(({data,error})=>{if(error)throw error;if(data.session?.user)loadStudentData(data.session.user);else renderAccount()}).catch(e=>{console.error(e);msg('We could not check your account session. Please refresh and try again.',true)});client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){clearTimeout(syncTimer);currentUser=null;isApplyingCloud=true;window.StudyPilot.replaceData(window.StudyPilot.freshData());isApplyingCloud=false;renderAccount();setSaveLabel('Sign in to save')}})}catch(e){console.error(e);msg('Could not initialize the cloud connection.',true)}}else{setSaveLabel('Cloud not configured',true);$('#settingsAccountStatus').textContent='The site administrator needs to add the Supabase URL and public key in config.js.';renderAccount()}
})();

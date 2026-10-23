import {firebaseConfig} from './firebase-config.js';
const screen=document.getElementById('auth'),form=document.getElementById('auth-form');
const login=document.getElementById('auth-login'),password=document.getElementById('auth-password');
const submit=form.querySelector('button'),error=document.getElementById('auth-error');
const sessionKey='reptro-auth-session';
function resolveLogin(value){
 const username=value.trim().toLowerCase();
 // Firebase uses email identifiers internally; people enter only their login.
 return username.includes('@')?username:`${username}@${firebaseConfig.projectId}.firebaseapp.com`;
}
let signedIn=false;
function updateViewport(){
 const viewport=window.visualViewport;
 // Follow the visible viewport rather than the layout viewport behind the iOS keyboard.
 screen.style.setProperty('--auth-height',`${viewport?.height??window.innerHeight}px`);
 screen.style.setProperty('--auth-top',`${viewport?.offsetTop??0}px`);
 screen.classList.toggle('auth-focused',form.contains(document.activeElement)&&document.activeElement.tagName==='INPUT');
}
form.addEventListener('focusin',updateViewport);
form.addEventListener('focusout',()=>requestAnimationFrame(updateViewport));
window.visualViewport?.addEventListener('resize',updateViewport);
window.visualViewport?.addEventListener('scroll',updateViewport);
window.addEventListener('resize',updateViewport);updateViewport();
login.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();password.focus()}});
form.addEventListener('input',()=>{error.hidden=true});
const messages={INVALID_LOGIN_CREDENTIALS:'Неверный логин или пароль',EMAIL_NOT_FOUND:'Неверный логин или пароль',INVALID_PASSWORD:'Неверный логин или пароль',USER_DISABLED:'Этот аккаунт отключён',TOO_MANY_ATTEMPTS_TRY_LATER:'Слишком много попыток. Попробуй позже',OPERATION_NOT_ALLOWED:'В Firebase ещё не включён вход по почте и паролю'};
async function enter(session){
 if(signedIn)return;
 // Only a verified Firebase response can open the user's workout space.
 window.workoutUserId=session.localId;
 await import('./app.js?v=39');
 signedIn=true;password.value='';document.activeElement?.blur();
 screen.hidden=true;document.body.classList.remove('auth-visible');document.querySelector('.app').hidden=false;
 const logout=document.createElement('button');logout.className='auth-logout';logout.textContent='Выйти';
 logout.onclick=()=>{localStorage.removeItem(sessionKey);location.reload()};
 document.getElementById('summary').prepend(logout);
}
form.addEventListener('submit',async event=>{
 event.preventDefault();error.hidden=true;
 if(!firebaseConfig.apiKey){error.textContent='Вход пока не подключён — настраиваем Firebase.';error.hidden=false;return}
 submit.disabled=true;submit.textContent='Входим…';
 try{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:resolveLogin(login.value),password:password.value,returnSecureToken:true})});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'UNKNOWN');
  localStorage.setItem(sessionKey,JSON.stringify({refreshToken:data.refreshToken}));await enter(data);
 }catch(problem){error.textContent=messages[problem.message]??'Не удалось войти. Проверь подключение и попробуй ещё раз.';error.hidden=false}
 finally{submit.disabled=false;submit.textContent='Продолжить'}
});
// Validate saved sessions with Firebase before displaying any user data.
if(firebaseConfig.apiKey){
 try{
  const saved=JSON.parse(localStorage.getItem(sessionKey));
  if(saved?.refreshToken){
   const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken})});
   const data=await response.json();
   if(response.ok){localStorage.setItem(sessionKey,JSON.stringify({refreshToken:data.refresh_token}));await enter({localId:data.user_id})}
   else localStorage.removeItem(sessionKey);
  }
 }catch{/* Remain on the login screen when offline. */}
}

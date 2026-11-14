const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

(async () => {
  const output = path.resolve(process.argv[2]);
  fs.mkdirSync(output, { recursive: true });
  const password = fs.readFileSync(path.resolve('..','.env'),'utf8').split(/\r?\n/).find(line=>line.startsWith('DEMO_PASSWORD=')).slice('DEMO_PASSWORD='.length);
  const fullStack = Boolean(process.env.CLINIC_BASE_URL);
  const base = process.env.CLINIC_BASE_URL || 'http://127.0.0.1:15173';
  const metadata = {started_at_utc:new Date().toISOString(),commit:'UNCOMMITTED',scope:fullStack?'Soft Minimal browser -> Nginx/API/PostgreSQL/RabbitMQ/Mailpit':'Soft Minimal browser -> native API/isolated SQLite; no SMTP proof',checks:[],bundle_sha256:{}};
  for(const file of fs.readdirSync('dist/assets')) metadata.bundle_sha256[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join('dist/assets',file))).digest('hex');
  let browser, page, patientToken, patientAppointment, patientCancelled, otherToken, otherAppointment, adminToken, createdDoctor, createdSlot;
  const demoDoctor = 'BS. UI Demo '+crypto.randomUUID().slice(0,6);
  const dateKey = iso => {
    const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  };
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    page = await browser.newPage({viewport:{width:1440,height:1080}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.name));
    await page.goto(base);
    await expect(page.getByRole('heading',{name:'Đăng nhập để đặt lịch'})).toBeVisible();
    await page.screenshot({animations:'disabled',path:path.join(output,'login-desktop.png'),fullPage:true});
    metadata.browser_version=browser.version();
    metadata.palette=await page.evaluate(()=>({font:getComputedStyle(document.body).fontFamily,body_size:getComputedStyle(document.body).fontSize,background:getComputedStyle(document.documentElement).backgroundColor,primary:getComputedStyle(document.querySelector('.button-primary')).backgroundColor,text:getComputedStyle(document.body).color,border:getComputedStyle(document.querySelector('.card')).borderColor,radius:getComputedStyle(document.querySelector('.card')).borderRadius}));
    await page.getByLabel('Email',{exact:true}).fill('patient@example.test');
    const wrongPassword='Wrong-demo-value-for-UX-check';
    await page.getByLabel('Mật khẩu',{exact:true}).fill(wrongPassword);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng');
    await expect(page.getByLabel('Email',{exact:true})).toHaveValue('patient@example.test');
    await expect(page.getByLabel('Mật khẩu',{exact:true})).toHaveValue(wrongPassword);
    metadata.checks.push('login error retains entered email and password');
    await page.screenshot({animations:'disabled',path:path.join(output,'login-error.png'),fullPage:true});
    async function login(email) {
      await page.getByLabel('Email',{exact:true}).fill(email);
      await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
      const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST'&&r.status()===200);
      const appointmentResponse=page.waitForResponse(r=>r.url().endsWith('/appointments')&&r.request().method()==='GET'&&r.status()===200);
      const optionsResponse=page.waitForResponse(r=>r.url().endsWith('/api/options')&&r.status()===200);
      await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
      const result=await(await loginResponse).json();
      const records=await(await appointmentResponse).json();
      const options=await(await optionsResponse).json();
      await expect(page.locator('.main-nav')).toBeVisible();
      return {...result,count:records.length,lead:options.reminder_lead_minutes};
    }
    const patient=await login('patient@example.test');
    patientToken=patient.access_token;
    await expect(page.getByRole('heading',{name:'Chọn bác sĩ của bạn'})).toBeVisible();
    const firstDoctor=page.locator('[data-doctor]').first();
    const doctorId=await firstDoctor.getAttribute('data-doctor');
    const otherAuth=await page.request.post(base+'/api/auth/login',{data:{email:'other@example.test',password}});
    expect(otherAuth.status()).toBe(200); otherToken=(await otherAuth.json()).access_token;
    const slotResponse=await page.request.get(base+`/api/doctors/${doctorId}/slots`,{headers:{Authorization:'Bearer '+otherToken}});
    const available=(await slotResponse.json()).filter(slot=>new Date(slot.starts_at).getTime()>Date.now()+(patient.lead+5)*60_000);
    if(available.length<2) throw new Error('Seed needs two future slots for UX scenario');
    const selected=available[0];
    const held=available.find(slot=>slot.id!==selected.id&&dateKey(slot.starts_at)===dateKey(selected.starts_at));
    if(!held) throw new Error('Seed needs two slots on the same day');
    const hold=await page.request.post(base+'/api/appointments',{headers:{Authorization:'Bearer '+otherToken,'Idempotency-Key':crypto.randomUUID()},data:{slot_id:held.id,reminder_enabled:false}});
    expect(hold.status()).toBe(201); otherAppointment=(await hold.json()).id;
    const calendarResponse=page.waitForResponse(r=>r.url().includes(`/api/doctors/${doctorId}/slots?`)&&r.status()===200);
    await firstDoctor.click(); await calendarResponse;
    await page.screenshot({animations:'disabled',path:path.join(output,'doctors-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Chọn ngày và giờ khám'})).toBeVisible();
    await page.locator(`[data-date="${dateKey(selected.starts_at)}"]`).click();
    await expect(page.locator(`[data-slot="${held.id}"]`)).toBeDisabled();
    await expect(page.locator(`[data-slot="${held.id}"]`)).toContainText('Đã hết chỗ');
    await page.locator(`[data-slot="${selected.id}"]`).click();
    await expect(page.locator(`[data-slot="${selected.id}"]`)).toHaveAttribute('aria-pressed','true');
    metadata.checks.push('real occupied slot disabled and selected slot visually/semantically distinct');
    await page.screenshot({animations:'disabled',path:path.join(output,'slots-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({animations:'disabled',path:path.join(output,'slots-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Xem lại lịch hẹn',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Xem lại lịch hẹn',exact:true})).toBeVisible();
    const reminder=page.getByRole('switch',{name:'Nhắc lịch qua email',exact:true});
    await expect(reminder).toBeChecked(); await reminder.uncheck();
    await expect(page.locator('.review-details')).toContainText('patient@example.test');
    await page.screenshot({animations:'disabled',path:path.join(output,'review-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1080});
    await page.screenshot({animations:'disabled',path:path.join(output,'review-desktop.png'),fullPage:true});
    const requests=[];
    page.on('request',r=>{if(r.url().endsWith('/api/appointments')&&r.method()==='POST') requests.push({key:r.headers()['idempotency-key'],body:r.postData()});});
    let injected=false;
    let releaseFault;
    const faultGate=new Promise(resolve=>{releaseFault=resolve;});
    await page.route('**/api/appointments',async route=>{if(route.request().method()==='POST'&&!injected){injected=true;await faultGate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Dịch vụ đang bận. Vui lòng thử lại.'}})});}else await route.continue();});
    await page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true}).click();
    try{
      const processing=page.getByRole('button',{name:'Đang đặt lịch…',exact:true});
      await expect(processing).toBeDisabled();
      await expect(processing).toHaveAttribute('aria-busy','true');
      await page.screenshot({animations:'disabled',path:path.join(output,'review-processing.png'),fullPage:true});
      metadata.checks.push('processing state visible and confirmation disabled while request is pending');
    }finally{releaseFault();}
    await expect(page.getByRole('alert')).toContainText('Dịch vụ đang bận');
    await expect(page.getByRole('heading',{name:'Xem lại lịch hẹn',exact:true})).toBeVisible();
    await expect(reminder).not.toBeChecked();
    await expect(page.locator('.review-details')).toContainText('patient@example.test');
    await page.screenshot({animations:'disabled',path:path.join(output,'review-error.png'),fullPage:true});
    metadata.checks.push('review step and reminder choice retained after HTTP503');
    const bookedResponse=page.waitForResponse(r=>r.url().endsWith('/api/appointments')&&r.request().method()==='POST'&&r.status()===201);
    await page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true}).click();
    const booked=await(await bookedResponse).json(); metadata.appointment_id=booked.id; patientAppointment=booked.id;
    await expect(page.getByRole('heading',{name:'Đặt lịch thành công',exact:true})).toBeVisible();
    expect(requests.length).toBe(2); expect(requests[0].key).toBe(requests[1].key); expect(requests[0].body).toBe(requests[1].body);
    metadata.checks.push('retry uses same Idempotency-Key and unchanged payload');
    if(fullStack){await expect(page.locator('.success-card .notice')).toContainText('Đã gửi email xác nhận',{timeout:30000});metadata.checks.push('booking confirmed through real RabbitMQ/SMTP Mailpit');}
    await page.screenshot({animations:'disabled',path:path.join(output,'success-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'Xem lịch hẹn',exact:true}).click();
    const card=page.locator(`[data-appointment="${booked.id}"]`);
    await expect(page.locator('.appointment-item')).toHaveCount(patient.count+1);
    const savedReminder=card.getByRole('switch',{name:'Nhắc lịch qua email',exact:true});
    await expect(savedReminder).not.toBeChecked();
    async function setSavedReminder(enabled){
      const saved=page.waitForResponse(r=>r.url().endsWith(`/api/appointments/${booked.id}/reminder`)&&r.request().method()==='PATCH'&&r.status()===200);
      await savedReminder.click(); await saved;
      if(enabled) await expect(savedReminder).toBeChecked(); else await expect(savedReminder).not.toBeChecked();
    }
    await setSavedReminder(true);
    let persisted=await page.request.get(base+'/api/appointments/'+booked.id,{headers:{Authorization:'Bearer '+patient.access_token}});
    expect((await persisted.json()).reminder_enabled).toBe(true);
    await setSavedReminder(false);
    persisted=await page.request.get(base+'/api/appointments/'+booked.id,{headers:{Authorization:'Bearer '+patient.access_token}});
    expect((await persisted.json()).reminder_enabled).toBe(false);
    await setSavedReminder(true);
    metadata.checks.push('reminder switch persists on/off to backend and can be re-enabled');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({animations:'disabled',path:path.join(output,'appointments-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({animations:'disabled',path:path.join(output,'appointments-mobile.png')});
    page.once('dialog',dialog=>dialog.accept());
    await card.getByRole('button',{name:'Hủy lịch hẹn',exact:true}).click();
    await expect(card.locator('.badge')).toHaveText('Đã hủy');
    patientCancelled=true;
    metadata.checks.push('cancelled appointment stops reminder controls and preserves history');
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
    await login('other@example.test');
    await page.locator('.main-nav').getByRole('button',{name:'Lịch hẹn của tôi',exact:true}).click();
    await expect(page.locator(`[data-appointment="${booked.id}"]`)).toHaveCount(0);
    metadata.checks.push('another patient cannot see the created appointment');
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
    await page.setViewportSize({width:1440,height:1080});
    adminToken=(await login('admin@example.test')).access_token;
    await page.getByRole('button',{name:'Bác sĩ & khung giờ',exact:true}).click();
    await page.getByLabel('Họ tên',{exact:true}).fill(demoDoctor);
    await page.getByLabel('Chuyên khoa',{exact:true}).fill('Khám giả lập');
    const newDoctorResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/doctors')&&r.status()===201);
    await page.getByRole('button',{name:'Thêm bác sĩ',exact:true}).click();
    createdDoctor=(await(await newDoctorResponse).json()).id;
    await expect(page.getByRole('status')).toContainText('Đã thêm bác sĩ');
    await page.getByLabel('Bác sĩ',{exact:true}).selectOption(createdDoctor);
    const vnDate=new Date(Date.now()+9*86400000+7*3600000).toISOString().slice(0,10);
    await page.getByLabel('Bắt đầu (giờ Việt Nam)').fill(vnDate+'T09:00');
    const newSlotResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/slots')&&r.status()===201);
    await page.getByRole('button',{name:'Thêm khung 30 phút',exact:true}).click();
    createdSlot=(await(await newSlotResponse).json()).id;
    await expect(page.getByRole('status')).toContainText('Đã thêm khung khám 30 phút');
    await page.screenshot({animations:'disabled',path:path.join(output,'admin-setup-desktop.png'),fullPage:true});
    metadata.checks.push('admin doctor/slot management remains functional');
    expect(errors).toEqual([]); metadata.checks.push('no uncaught JavaScript errors and mobile no page overflow');
    metadata.exit_code=0;
    console.log('Soft Minimal UI smoke passed:',metadata.checks.length,'checks');
  }catch(error){metadata.exit_code=1;metadata.error=String(error.message).replaceAll(password,'[REDACTED_DEMO_PASSWORD]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[REDACTED_JWT]');console.error(metadata.error);process.exitCode=1;}
  finally {
    metadata.cleanup=[];
    if(page){
      if(patientToken&&patientAppointment&&!patientCancelled){const result=await page.request.post(base+'/api/appointments/'+patientAppointment+'/cancel',{headers:{Authorization:'Bearer '+patientToken}}).catch(()=>null);metadata.cleanup.push({resource:'own synthetic patient appointment after interrupted test',status:result?.status()});}
      if(otherToken&&otherAppointment){const result=await page.request.post(base+'/api/appointments/'+otherAppointment+'/cancel',{headers:{Authorization:'Bearer '+otherToken}}).catch(()=>null);metadata.cleanup.push({resource:'own synthetic held appointment',status:result?.status()});}
      if(adminToken&&createdSlot){const result=await page.request.delete(base+'/api/admin/slots/'+createdSlot,{headers:{Authorization:'Bearer '+adminToken}}).catch(()=>null);metadata.cleanup.push({resource:'own unused synthetic slot',status:result?.status()});}
      if(adminToken&&createdDoctor){const result=await page.request.put(base+'/api/admin/doctors/'+createdDoctor,{headers:{Authorization:'Bearer '+adminToken},data:{name:demoDoctor,specialty:'Khám giả lập',active:false}}).catch(()=>null);metadata.cleanup.push({resource:'deactivate own synthetic doctor',status:result?.status()});}
    }
    if(browser) await browser.close();
    metadata.ended_at_utc=new Date().toISOString();
    fs.writeFileSync(path.join(output,'metadata.json'),JSON.stringify(metadata,null,2));
  }
})();

const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

(async()=>{
  const output=path.resolve(process.argv[2]); fs.mkdirSync(output,{recursive:true});
  const base=process.env.CLINIC_BASE_URL||'http://127.0.0.1:18080';
  const password=fs.readFileSync('../.env','utf8').split(/\r?\n/).find(line=>line.startsWith('DEMO_PASSWORD=')).slice(14);
  const metadata={started_at_utc:new Date().toISOString(),commit:'UNCOMMITTED',scope:'UI requirement audit: real API login/doctors/slots; intercepted transport failures and synthetic reminder-status responses. No appointment created or changed.',checks:[]};
  let browser;
  const redact=value=>String(value).replaceAll(password,'[REDACTED]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[REDACTED_JWT]');
  async function check(name,work){
    try{await work();metadata.checks.push({name,result:'PASS'});}
    catch(error){metadata.checks.push({name,result:'FAIL',error:redact(error.message)});}
  }
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(e.name));
    await page.goto(base);
    await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
    const doctorsResponse=page.waitForResponse(r=>r.url().endsWith('/api/doctors')&&r.status()===200);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    const doctors=await(await doctorsResponse).json();
    await expect(page.getByRole('heading',{name:'Chọn bác sĩ của bạn'})).toBeVisible();
    await check('doctor search empty state retains query',async()=>{
      const search=page.getByLabel('Tìm bác sĩ',{exact:true});
      await search.fill('KhongCoBacSiPhuHopAudit');
      await expect(page.getByRole('heading',{name:'Chưa tìm thấy bác sĩ phù hợp'})).toBeVisible();
      await expect(search).toHaveValue('KhongCoBacSiPhuHopAudit'); await search.fill('');
    });
    let releaseSlots, firstSlots=true, conflictSlot='';
    const loadingGate=new Promise(resolve=>{releaseSlots=resolve;});
    await page.route(/\/api\/doctors\/[^/]+\/slots(?:\?.*)?$/,async route=>{
      if(firstSlots){firstSlots=false;await loadingGate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Chưa tải được khung giờ. Vui lòng thử lại.'}})});}
      else if(conflictSlot){const response=await route.fetch();const slots=await response.json();await route.fulfill({response,json:slots.map(slot=>slot.id===conflictSlot?{...slot,available:false}:slot)});}
      else await route.continue();
    });
    const firstDoctor=page.locator('[data-doctor]').first();const doctorId=await firstDoctor.getAttribute('data-doctor');
    await firstDoctor.click(); await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    try{await check('slot loading indicator while request is pending',async()=>{await expect(page.getByRole('status')).toContainText('Đang tải khung giờ khám');});}
    finally{releaseSlots();}
    await expect(page.getByRole('alert')).toContainText('Chưa tải được khung giờ');
    await check('slot retry restores selected day and visible available times',async()=>{
      await page.getByRole('button',{name:'Tải lại khung giờ',exact:true}).click();
      await expect(page.locator('.date-strip button[aria-pressed="true"]')).toHaveCount(1,{timeout:3000});
      await expect(page.locator('[data-slot][data-available="true"]').first()).toBeVisible();
    });
    await page.locator('[data-date]').first().click();
    const available=page.locator('[data-slot][data-available="true"]').first();const slotId=await available.getAttribute('data-slot');
    await available.click(); await page.getByRole('button',{name:'Xem lại lịch hẹn',exact:true}).click();
    const reminder=page.getByRole('switch',{name:'Nhắc lịch qua email',exact:true});await reminder.uncheck();
    await page.getByRole('button',{name:'Sửa lịch hẹn',exact:true}).click();
    await check('back/edit preserves chosen time and reminder preference',async()=>{
      await expect(page.locator(`[data-slot="${slotId}"]`)).toHaveAttribute('aria-pressed','true');
      await page.getByRole('button',{name:'Xem lại lịch hẹn',exact:true}).click();await expect(reminder).not.toBeChecked();
    });
    let fault='network';const retries=[];
    await page.route('**/api/appointments',async route=>{
      if(route.request().method()!=='POST'){await route.continue();return;}
      retries.push({key:route.request().headers()['idempotency-key'],payload:route.request().postData()});
      if(fault==='network') await route.abort('connectionfailed');
      else if(fault==='html') await route.fulfill({status:502,contentType:'text/html',body:'<html>Bad Gateway</html>'});
      else{conflictSlot=slotId;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Khung giờ đã được đặt'}})});}
    });
    await check('network loss preserves review, email and reminder choice',async()=>{
      await page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true}).click();
      await expect(page.getByRole('alert')).toContainText('Chưa thể kết nối');
      await expect(page.getByRole('heading',{name:'Xem lại lịch hẹn',exact:true})).toBeVisible();
      await expect(page.locator('.review-details')).toContainText('patient@example.test');await expect(reminder).not.toBeChecked();
      await page.screenshot({animations:'disabled',path:path.join(output,'network-error.png'),fullPage:true});
    });
    fault='html';
    await check('non-JSON gateway error retains review data and same idempotency key',async()=>{
      await page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true}).click();
      await expect(page.getByRole('alert')).toContainText('Máy chủ tạm thời chưa sẵn sàng');
      await expect(reminder).not.toBeChecked(); expect(retries[1]).toEqual(retries[0]);
    });
    fault='conflict';
    await check('concurrent slot conflict retains details and requires another time',async()=>{
      await page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true}).click();
      await expect(page.getByRole('button',{name:'Xác nhận đặt lịch',exact:true})).toBeDisabled();
      await expect(page.locator('.step-content').getByRole('alert')).toContainText('Khung giờ này vừa hết chỗ');
      await expect(page.locator('.review-details')).toContainText('patient@example.test');await expect(reminder).not.toBeChecked();
      await page.getByRole('button',{name:'Sửa lịch hẹn',exact:true}).click();
      await expect(page.locator(`[data-slot="${slotId}"]`)).toBeDisabled();
    });
    const fixture={id:crypto.randomUUID(),doctor:doctors.find(d=>d.id===doctorId).name,slot:{id:slotId,doctor_id:doctorId,starts_at:new Date(Date.now()+30*60000).toISOString(),ends_at:new Date(Date.now()+60*60000).toISOString()},status:'BOOKED',version:1,notification_status:'SENT',notification_error:null,reminder_enabled:true,reminder_at:new Date(Date.now()-30*60000).toISOString(),reminder_status:'FAILED_DLQ'};
    await page.unroute('**/api/appointments');
    await page.route('**/api/appointments',async route=>{
      if(route.request().method()==='GET') await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([fixture])});
      else await route.abort('blockedbyclient');
    });
    await page.locator('.main-nav').getByRole('button',{name:'Lịch hẹn của tôi',exact:true}).click();
    async function loadFixture(){
      const response=page.waitForResponse(r=>r.url().endsWith('/api/appointments')&&r.request().method()==='GET');
      await page.getByRole('button',{name:'Làm mới',exact:true}).click();await response;
      await expect(page.locator(`[data-appointment="${fixture.id}"]`)).toBeVisible();
    }
    await loadFixture();
    await check('reminder delivery failure is visible separately from confirmation SENT',async()=>{
      const card=page.locator(`[data-appointment="${fixture.id}"]`);
      await expect(card.getByRole('alert')).toContainText('Email nhắc lịch chưa gửi được',{timeout:3000});
      await expect(card.locator('.delivery-note')).toContainText('Đã gửi email xác nhận');
    });
    await page.screenshot({animations:'disabled',path:path.join(output,'reminder-failure.png'),fullPage:true});
    for(const [state,text] of [['PENDING','Đang chờ gửi email nhắc lịch'],['PROCESSING','Đang gửi email nhắc lịch'],['RETRY_PENDING','Đang thử gửi lại email nhắc lịch'],['SENT','Email nhắc lịch đã được gửi']]){
      fixture.reminder_status=state;await loadFixture();
      await check('reminder status '+state+' is visible',async()=>{await expect(page.locator(`[data-appointment="${fixture.id}"]`)).toContainText(text,{timeout:1500});});
    }
    metadata.layouts=[];
    async function responsive(view){
      for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:width<800?844:1080});
        const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
        metadata.layouts.push({view,width,scroll_width:scrollWidth});
        expect(scrollWidth).toBeLessThanOrEqual(width);
      }
    }
    fixture.reminder_status='FAILED_DLQ';await loadFixture();
    await check('appointment history including reminder error fits mobile and desktop',async()=>{
      await responsive('history with synthetic reminder failure');
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({animations:'disabled',path:path.join(output,'reminder-failure-mobile.png'),fullPage:true});
    });
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
    await page.getByLabel('Email',{exact:true}).fill('admin@example.test');
    await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Quản lý phòng khám',exact:true})).toBeVisible();
    await check('admin appointment and setup views fit mobile and desktop',async()=>{
      await responsive('admin appointments');
      await page.getByRole('button',{name:'Bác sĩ & khung giờ',exact:true}).click();
      await responsive('admin doctor and slot forms');
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({animations:'disabled',path:path.join(output,'admin-mobile.png'),fullPage:true});
    });
    await check('JavaScript has no uncaught error',async()=>expect(errors).toEqual([]));
    metadata.exit_code=metadata.checks.some(check=>check.result==='FAIL')?1:0;
  }catch(error){metadata.exit_code=1;metadata.error=redact(error.message);}
  finally{if(browser)await browser.close();metadata.ended_at_utc=new Date().toISOString();fs.writeFileSync(path.join(output,'metadata.json'),JSON.stringify(metadata,null,2));console.log('Requirement audit:',metadata.checks.filter(c=>c.result==='PASS').length,'pass,',metadata.checks.filter(c=>c.result==='FAIL').length,'fail;',output);process.exitCode=metadata.exit_code;}
})();

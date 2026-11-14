import { useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { ApiError, request } from './api';
import { Icon, Spinner } from './icons';
import { canRemind, dateKey, dayLabel, fullTime, leadLabel, timeLabel, weekday, type Appointment, type Doctor, type Session, type Slot } from './types';

const statusLabel: Record<string, string> = { BOOKED: 'Sắp tới', CANCELLED: 'Đã hủy', COMPLETED: 'Hoàn tất' };
const deliveryLabel: Record<string, string> = { PENDING: 'Đang chờ gửi email xác nhận', PROCESSING: 'Đang gửi email xác nhận', RETRY_PENDING: 'Email đang được gửi lại', SENT: 'Đã gửi email xác nhận', FAILED_DLQ: 'Email chưa gửi được. Lịch hẹn vẫn được lưu.', SKIPPED: 'Thông báo cũ đã được bỏ qua' };
const reminderDeliveryLabel: Record<string, string> = {
  PENDING: 'Đang chờ gửi email nhắc lịch.',
  PROCESSING: 'Đang gửi email nhắc lịch.',
  RETRY_PENDING: 'Đang thử gửi lại email nhắc lịch.',
  SENT: 'Email nhắc lịch đã được gửi.',
  FAILED_DLQ: 'Email nhắc lịch chưa gửi được. Lịch hẹn vẫn được lưu; vui lòng xem thời gian khám ở trên.',
  SKIPPED: 'Email nhắc lịch đã được bỏ qua. Vui lòng xem thời gian khám ở trên.',
  CANCELLED: 'Đã dừng email nhắc lịch cho lịch hẹn này.',
};
function reminderDescription(appointment: Appointment, lead: number) {
  if (reminderDeliveryLabel[appointment.reminder_status]) return reminderDeliveryLabel[appointment.reminder_status];
  if (appointment.reminder_enabled) return canRemind(appointment.slot, lead) ? `Nhắc trước giờ khám ${leadLabel(lead)}.` : 'Đã lên lịch nhắc. Trạng thái gửi sẽ được cập nhật tại đây.';
  return canRemind(appointment.slot, lead) ? 'Đã tắt nhắc lịch. Bạn vẫn nhận được email xác nhận.' : 'Đã qua thời gian bật nhắc. Bạn vẫn có thể xem email xác nhận.';
}
type Banner = { kind: 'error' | 'success'; message: string } | null;

function Button({ children, busy = false, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button type="button" className={`button button-${variant}`} {...props} disabled={props.disabled || busy} aria-busy={busy}>{busy && <Spinner/>}{children}</button>;
}
function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : kind === 'success' ? 'status' : undefined}><Icon name={kind === 'success' ? 'check' : 'info'}/><div>{children}</div></div>;
}
function Toggle({ id, checked, disabled, onChange, title, description, busy = false, error = false }: { id: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; title: string; description: string; busy?: boolean; error?: boolean }) {
  return <div className="toggle-row"><div className="toggle-description"><label htmlFor={id}>{title}</label><p id={`${id}-help`} className={error ? 'reminder-error' : undefined} role={error ? 'alert' : undefined} aria-live={error ? undefined : 'polite'}>{description}</p></div>{busy && <Spinner/>}<input id={id} className="switch" type="checkbox" role="switch" checked={checked} disabled={disabled || busy} onChange={event => onChange(event.target.checked)} aria-describedby={`${id}-help`}/></div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const sessionToken = useRef('');
  const [email, setEmail] = useState('patient@example.test');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<'booking' | 'appointments' | 'admin'>('booking');
  const [adminSection, setAdminSection] = useState<'appointments' | 'setup'>('appointments');
  const [pending, setPending] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [syncError, setSyncError] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [lead, setLead] = useState(60);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [day, setDay] = useState('');
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [reminder, setReminder] = useState(true);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);
  const bookingKey = useRef<{ signature: string; key: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [adminDoctor, setAdminDoctor] = useState('');
  const [slotTime, setSlotTime] = useState('');

  const selectedDoctor = doctors.find(doctor => doctor.id === doctorId);
  const selectedAvailable = Boolean(chosen && slots.some(slot => slot.id === chosen.id && slot.available));
  const reminderEligible = Boolean(chosen && canRemind(chosen, lead));
  const effectiveReminder = reminder && reminderEligible;
  const busy = Boolean(pending);
  const days = [...new Set(slots.map(slot => dateKey(slot.starts_at)))];
  const daySlots = slots.filter(slot => dateKey(slot.starts_at) === day);
  const specialties = [...new Set(doctors.map(doctor => doctor.specialty))].sort();
  const visibleDoctors = doctors.filter(doctor => (!specialty || doctor.specialty === specialty) && `${doctor.name} ${doctor.specialty}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const liveConfirmation = appointments.find(appointment => appointment.id === confirmed?.id) || confirmed;

  async function act(key: string, work: () => Promise<void>) {
    setPending(key); setBanner(null);
    try { await work(); }
    catch (error) { setBanner({ kind: 'error', message: error instanceof Error ? error.message : 'Chưa thể hoàn tất. Vui lòng thử lại.' }); }
    finally { setPending(''); }
  }
  async function refreshAppointments(auth = session) {
    if (!auth) return;
    const list = await request<Appointment[]>(auth.role === 'admin' ? '/api/admin/appointments' : '/api/appointments', auth.token);
    if (sessionToken.current === auth.token) { setAppointments(list); setSyncError(''); }
  }
  async function safeRefresh() {
    try { await refreshAppointments(); }
    catch { setSyncError('Chưa cập nhật được trạng thái mới. Vui lòng bấm Làm mới để thử lại.'); }
  }
  async function reloadSlots() {
    if (!session || !doctorId) return;
    const list = await request<Slot[]>(`/api/doctors/${doctorId}/slots?include_unavailable=true`, session.token);
    if (sessionToken.current === session.token) {
      setSlots(list); setSlotError('');
      setDay(current => list.some(slot => dateKey(slot.starts_at) === current) ? current : list[0] ? dateKey(list[0].starts_at) : '');
    }
  }

  useEffect(() => {
    if (!session || !doctorId) return;
    const controller = new AbortController();
    setSlotLoading(true); setSlotError('');
    request<Slot[]>(`/api/doctors/${doctorId}/slots?include_unavailable=true`, session.token, { signal: controller.signal })
      .then(list => { if (!controller.signal.aborted) { setSlots(list); setDay(current => list.some(slot => dateKey(slot.starts_at) === current) ? current : list[0] ? dateKey(list[0].starts_at) : ''); } })
      .catch(error => { if (!controller.signal.aborted) setSlotError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setSlotLoading(false); });
    return () => controller.abort();
  }, [session, doctorId]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => { safeRefresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [session]);

  async function login(event: FormEvent) {
    event.preventDefault();
    await act('login', async () => {
      const result = await request<{ access_token: string; role: Session['role'] }>('/api/auth/login', '', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      const auth = { token: result.access_token, role: result.role, email: email.trim().toLowerCase() };
      const [doctorList, options, appointmentList] = await Promise.all([
        request<Doctor[]>('/api/doctors', auth.token),
        request<{ reminder_lead_minutes: number }>('/api/options', auth.token),
        request<Appointment[]>(auth.role === 'admin' ? '/api/admin/appointments' : '/api/appointments', auth.token),
      ]);
      sessionToken.current = auth.token; setSession(auth); setPassword('');
      setDoctors(doctorList); setAdminDoctor(doctorList[0]?.id || ''); setLead(options.reminder_lead_minutes); setAppointments(appointmentList);
      setView(auth.role === 'admin' ? 'admin' : 'booking'); setAdminSection('appointments');
    });
  }
  function logout() {
    sessionToken.current = ''; setSession(null); setAppointments([]); setBanner(null); setSyncError('');
    setDoctorId(''); setChosen(null); setSlots([]); setStep(1); setConfirmed(null); setFilter(''); bookingKey.current = null;
  }
  function chooseDoctor(id: string) {
    if (id !== doctorId) { setDoctorId(id); setChosen(null); setSlots([]); setDay(''); }
  }
  function newBooking() { setConfirmed(null); setChosen(null); setStep(1); setBanner(null); bookingKey.current = null; setView('booking'); }
  async function book() {
    if (!session || !chosen) return;
    await act('book', async () => {
      const payload = { slot_id: chosen.id, reminder_enabled: effectiveReminder };
      const signature = JSON.stringify(payload);
      if (bookingKey.current?.signature !== signature) bookingKey.current = { signature, key: crypto.randomUUID() };
      let result: Appointment;
      try { result = await request<Appointment>('/api/appointments', session.token, { method: 'POST', headers: { 'Idempotency-Key': bookingKey.current.key }, body: signature }); }
      catch (error) { if (error instanceof ApiError && error.status === 409) await reloadSlots().catch(() => {}); throw error; }
      setConfirmed(result); setAppointments(current => [result, ...current.filter(appointment => appointment.id !== result.id)]); bookingKey.current = null;
      await safeRefresh(); await reloadSlots().catch(() => {});
    });
  }
  async function cancel(appointment: Appointment) {
    if (!session || !window.confirm(`Bạn muốn hủy lịch khám với ${appointment.doctor} vào ${fullTime(appointment.slot)}?`)) return;
    await act(`cancel:${appointment.id}`, async () => {
      const result = await request<Appointment>(`/api/appointments/${appointment.id}/cancel`, session.token, { method: 'POST' });
      setAppointments(current => current.map(item => item.id === result.id ? result : item));
      setBanner({ kind: 'success', message: 'Đã hủy lịch hẹn và dừng nhắc lịch. Email cập nhật sẽ được gửi đến bạn.' });
      await reloadSlots().catch(() => {});
    });
  }
  async function toggleReminder(appointment: Appointment, enabled: boolean) {
    if (!session) return;
    await act(`reminder:${appointment.id}`, async () => {
      const result = await request<Appointment>(`/api/appointments/${appointment.id}/reminder`, session.token, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setAppointments(current => current.map(item => item.id === result.id ? result : item));
      setBanner({ kind: 'success', message: enabled ? 'Đã bật nhắc lịch qua email.' : 'Đã tắt nhắc lịch cho lịch hẹn này.' });
    });
  }

  function appointmentCards(admin = false) {
    const list = appointments.filter(appointment => !filter || appointment.status === filter);
    return <section className="card appointments-panel"><div className="panel-heading"><div><h2>{admin ? 'Danh sách lịch hẹn' : 'Lịch hẹn của tôi'}</h2><p>{admin ? 'Theo dõi lịch khám và trạng thái thông báo.' : 'Xem lịch đã đặt hoặc điều chỉnh nhắc lịch.'}</p></div><Button variant="secondary" busy={pending === 'refresh'} onClick={() => act('refresh', safeRefresh)}><Icon name="refresh"/>Làm mới</Button></div>
      <div className="filter-row"><label htmlFor="appointment-filter">Trạng thái</label><select id="appointment-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Tất cả lịch hẹn</option>{Object.entries(statusLabel).map(([status, text]) => <option key={status} value={status}>{text}</option>)}</select><span className="result-count">{list.length} lịch hẹn</span></div>
      {syncError && <Notice kind="error">{syncError}</Notice>}
      {!list.length ? <div className="empty-state"><span className="empty-icon"><Icon name="calendar" size={28}/></span><h3>Chưa có lịch hẹn</h3><p>{filter ? 'Chưa có lịch hẹn ở trạng thái này.' : 'Lịch khám của bạn sẽ xuất hiện tại đây sau khi đặt thành công.'}</p>{!admin && <Button onClick={newBooking}>Đặt lịch khám<Icon name="next"/></Button>}</div> : <ul className="appointment-list">{list.map(appointment => <li className="appointment-item" key={appointment.id} data-appointment={appointment.id}>
        <div className="appointment-top"><div className="appointment-doctor"><span className="avatar"><Icon name="user"/></span><div><h3>{appointment.doctor}</h3><p>Mã lịch hẹn <strong>{appointment.id.slice(0, 8).toUpperCase()}</strong></p></div></div><span className={`badge badge-${appointment.status.toLowerCase()}`}>{statusLabel[appointment.status]}</span></div>
        <div className="appointment-time"><Icon name="calendar"/><span>{dayLabel(appointment.slot.starts_at)}</span><Icon name="clock"/><span>{timeLabel(appointment.slot.starts_at)} – {timeLabel(appointment.slot.ends_at)}</span></div>
        <p className="delivery-note"><Icon name="mail" size={18}/>{deliveryLabel[appointment.notification_status] || 'Đang cập nhật trạng thái email'}</p>
        {admin && appointment.notification_error && <p className="field-help">Mã lỗi gửi: {appointment.notification_error}</p>}
        {appointment.status === 'BOOKED' && new Date(appointment.slot.starts_at) > new Date() && !admin && <Toggle id={`reminder-${appointment.id}`} checked={appointment.reminder_enabled} disabled={busy || (!appointment.reminder_enabled && !canRemind(appointment.slot, lead))} busy={pending === `reminder:${appointment.id}`} title="Nhắc lịch qua email" description={reminderDescription(appointment, lead)} error={appointment.reminder_status === 'FAILED_DLQ'} onChange={enabled => toggleReminder(appointment, enabled)}/>}
        {appointment.status === 'BOOKED' && <div className="appointment-actions">{!admin && new Date(appointment.slot.starts_at) > new Date() && <Button variant="ghost" busy={pending === `cancel:${appointment.id}`} disabled={busy} onClick={() => cancel(appointment)}>Hủy lịch hẹn</Button>}{admin && new Date(appointment.slot.ends_at) < new Date() && <Button variant="secondary" busy={pending === `complete:${appointment.id}`} disabled={busy} onClick={() => act(`complete:${appointment.id}`, async () => { const result = await request<Appointment>(`/api/admin/appointments/${appointment.id}/complete`, session!.token, { method: 'POST' }); setAppointments(current => current.map(item => item.id === result.id ? result : item)); setBanner({ kind: 'success', message: 'Đã đánh dấu hoàn tất lịch khám.' }); })}>Đánh dấu hoàn tất</Button>}</div>}
      </li>)}</ul>}
    </section>;
  }

  return <div className="site-shell"><header className="site-header"><div className="header-inner"><a className="brand" href="/" aria-label="An Uyên Hospital, trang chủ"><img src="/brand/an-uyen-logo-blue.svg" alt="Logo An Uyên Hospital" width="44" height="44"/><span>An Uyên<small>HOSPITAL</small></span></a>
    {session ? <><nav className="main-nav" aria-label="Điều hướng chính">{session.role === 'patient' ? <><button className={view === 'booking' ? 'active' : ''} aria-current={view === 'booking' ? 'page' : undefined} onClick={() => { setView('booking'); setBanner(null); }}><Icon name="calendar"/>Đặt lịch khám</button><button className={view === 'appointments' ? 'active' : ''} aria-current={view === 'appointments' ? 'page' : undefined} onClick={() => { setView('appointments'); setBanner(null); }}><Icon name="clock"/>Lịch hẹn của tôi</button></> : <><button className={adminSection === 'appointments' ? 'active' : ''} onClick={() => { setAdminSection('appointments'); setBanner(null); }}>Lịch hẹn</button><button className={adminSection === 'setup' ? 'active' : ''} onClick={() => { setAdminSection('setup'); setBanner(null); }}>Bác sĩ &amp; khung giờ</button></>}</nav><div className="account"><span className="account-label"><Icon name="user"/>{session.role === 'admin' ? 'Quản trị viên' : 'Tài khoản của tôi'}</span><button className="logout-button" onClick={logout} disabled={busy} aria-label="Đăng xuất"><Icon name="logout"/><span>Đăng xuất</span></button></div></> : <span className="header-assurance"><Icon name="lock" size={18}/>Thông tin được bảo vệ</span>}
    </div></header>
    <main className="page-container"><div className="page-intro"><div><p className="eyebrow">CHĂM SÓC SỨC KHỎE, NHẸ NHÀNG HƠN</p><h1>{!session ? 'Đặt lịch khám, an tâm hơn.' : session.role === 'admin' ? 'Quản lý phòng khám' : view === 'appointments' ? 'Lịch hẹn của bạn' : 'Đặt lịch khám'}</h1><p>{!session ? 'Một vài bước đơn giản để chọn lịch khám phù hợp với bạn.' : session.role === 'admin' ? 'Sắp xếp lịch khám và theo dõi thông báo tại một nơi.' : view === 'appointments' ? 'Theo dõi lịch khám và chủ động sắp xếp thời gian của bạn.' : 'Chọn bác sĩ, thời gian và xem lại thông tin trước khi xác nhận.'}</p></div><span className="timezone"><Icon name="clock" size={18}/>Giờ Việt Nam · UTC+7</span></div>
      {banner && <div className="page-banner"><Notice kind={banner.kind}>{banner.message}</Notice></div>}
      {!session ? <div className="login-layout"><section className="card login-card"><div className="card-icon"><Icon name="user" size={24}/></div><h2>Đăng nhập để đặt lịch</h2><p>Vui lòng sử dụng tài khoản đã được cung cấp.</p><form onSubmit={login}><div className="field"><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} placeholder="Nhập địa chỉ email"/></div><div className="field"><label htmlFor="login-password">Mật khẩu</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} placeholder="Nhập mật khẩu"/></div><Button type="submit" busy={pending === 'login'}>{pending === 'login' ? 'Đang đăng nhập…' : 'Đăng nhập'}{!busy && <Icon name="next"/>}</Button></form><p className="login-help"><Icon name="lock" size={16}/>Thông tin đăng nhập chỉ dùng để truy cập lịch hẹn của bạn.</p></section><aside className="login-guide"><h2>Lịch khám phù hợp,<br/>chủ động mỗi ngày.</h2><p>Đặt lịch và nhận thông báo để không bỏ lỡ cuộc hẹn.</p><ol>{[['user', 'Chọn bác sĩ', 'Tìm bác sĩ và chuyên khoa phù hợp.'], ['calendar', 'Chọn thời gian', 'Xem các khung giờ còn trống.'], ['bell', 'Nhận thông báo', `Nhận email xác nhận và tùy chọn nhắc trước ${leadLabel(lead)}.`]].map(([icon, title, text], index) => <li key={title}><span className="guide-icon"><Icon name={icon}/></span><div><span className="guide-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></div></li>)}</ol><div className="gentle-note"><Icon name="heart"/>Dành thời gian cho sức khỏe của bạn.</div></aside></div> : session.role === 'admin' ? adminSection === 'appointments' ? appointmentCards(true) : <div className="admin-layout"><section className="card"><div className="panel-heading"><div><h2>Thêm bác sĩ</h2><p>Cập nhật danh sách bác sĩ của phòng khám.</p></div><Icon name="user"/></div><form onSubmit={event => { event.preventDefault(); act('doctor', async () => { await request('/api/admin/doctors', session.token, { method: 'POST', body: JSON.stringify({ name: doctorName, specialty: newSpecialty }) }); setDoctorName(''); setNewSpecialty(''); setBanner({ kind: 'success', message: 'Đã thêm bác sĩ.' }); const list = await request<Doctor[]>('/api/doctors', session.token).catch(() => null); if (list) setDoctors(list); else setBanner({kind: 'success', message: 'Đã thêm bác sĩ. Vui lòng tải lại trang để cập nhật danh sách.'}); }); }}><div className="field"><label htmlFor="doctor-name">Họ tên</label><input id="doctor-name" value={doctorName} onChange={event => setDoctorName(event.target.value)} maxLength={100} required disabled={busy}/></div><div className="field"><label htmlFor="doctor-specialty">Chuyên khoa</label><input id="doctor-specialty" value={newSpecialty} onChange={event => setNewSpecialty(event.target.value)} maxLength={100} required disabled={busy}/></div><Button type="submit" busy={pending === 'doctor'} disabled={busy}>Thêm bác sĩ</Button></form></section><section className="card"><div className="panel-heading"><div><h2>Thêm khung giờ</h2><p>Mỗi khung khám mới kéo dài 30 phút.</p></div><Icon name="calendar"/></div><form onSubmit={event => { event.preventDefault(); act('slot', async () => { const start = new Date(slotTime + ':00+07:00'); await request('/api/admin/slots', session.token, { method: 'POST', body: JSON.stringify({ doctor_id: adminDoctor, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 1800000).toISOString() }) }); setSlotTime(''); setBanner({ kind: 'success', message: 'Đã thêm khung khám 30 phút.' }); }); }}><div className="field"><label htmlFor="admin-doctor">Bác sĩ</label><select id="admin-doctor" value={adminDoctor} onChange={event => setAdminDoctor(event.target.value)} required disabled={busy}>{doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>)}</select></div><div className="field"><label htmlFor="slot-time">Bắt đầu (giờ Việt Nam)</label><input id="slot-time" type="datetime-local" value={slotTime} onChange={event => setSlotTime(event.target.value)} required disabled={busy}/></div><Button type="submit" busy={pending === 'slot'} disabled={busy || !adminDoctor}>Thêm khung 30 phút</Button></form></section></div> : view === 'appointments' ? appointmentCards() : confirmed && liveConfirmation ? <section className="card success-card"><span className="success-icon"><Icon name="check" size={32}/></span><p className="eyebrow">THÔNG TIN ĐÃ ĐƯỢC LƯU</p><h2>Đặt lịch thành công</h2><p>Cảm ơn bạn đã lựa chọn An Uyên Hospital.</p><div className="success-summary"><h3>{liveConfirmation.doctor}</h3><p><Icon name="calendar"/>{fullTime(liveConfirmation.slot)}</p><p>Mã lịch hẹn <strong>{liveConfirmation.id.slice(0, 8).toUpperCase()}</strong></p></div><Notice kind={liveConfirmation.notification_status === 'FAILED_DLQ' ? 'error' : 'success'}>{deliveryLabel[liveConfirmation.notification_status] || 'Đang cập nhật trạng thái email'}</Notice>{liveConfirmation.reminder_enabled && <p className="confirmation-reminder"><Icon name="bell" size={18}/>Đã bật nhắc trước giờ khám {leadLabel(lead)}.</p>}<div className="success-actions"><Button onClick={() => { setView('appointments'); setBanner(null); }}>Xem lịch hẹn<Icon name="next"/></Button><Button variant="secondary" onClick={newBooking}>Đặt lịch mới</Button></div></section> : <div className="booking-layout"><section className="card booking-panel"><ol className="booking-steps" aria-label="Tiến trình đặt lịch">{['Chọn bác sĩ', 'Chọn lịch', 'Xem lại'].map((label, index) => <li key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span>{step > index + 1 ? <Icon name="check" size={16}/> : index + 1}</span><button disabled={busy || index + 1 > step} onClick={() => { setStep(index + 1); setBanner(null); }}>{label}</button></li>)}</ol>
        <div className="step-content" key={step}>
          {step === 1 ? <><div className="step-heading"><p className="step-caption">BƯỚC 1 / 3</p><h2>Chọn bác sĩ của bạn</h2><p>Tìm bác sĩ hoặc chọn theo chuyên khoa.</p></div><div className="doctor-filters"><div className="field"><label htmlFor="doctor-search">Tìm bác sĩ</label><div className="input-with-icon"><Icon name="search"/><input id="doctor-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên bác sĩ hoặc chuyên khoa"/></div></div><div className="field"><label htmlFor="specialty-filter">Chuyên khoa</label><select id="specialty-filter" value={specialty} onChange={event => setSpecialty(event.target.value)}><option value="">Tất cả chuyên khoa</option>{specialties.map(item => <option key={item}>{item}</option>)}</select></div></div><div className="doctor-grid">{visibleDoctors.map(doctor => <button type="button" key={doctor.id} className={`doctor-card ${doctorId === doctor.id ? 'selected' : ''}`} data-doctor={doctor.id} aria-pressed={doctorId === doctor.id} onClick={() => chooseDoctor(doctor.id)}><span className="avatar"><Icon name="user" size={24}/></span><span className="doctor-details"><strong>{doctor.name}</strong><span>{doctor.specialty}</span></span><span className="selection-indicator">{doctorId === doctor.id && <Icon name="check" size={14}/>}</span></button>)}</div>{!visibleDoctors.length && <div className="empty-state compact"><Icon name="search" size={26}/><h3>Chưa tìm thấy bác sĩ phù hợp</h3><p>Vui lòng thử tên khác hoặc chọn tất cả chuyên khoa.</p></div>}</> : step === 2 ? <><div className="step-heading"><p className="step-caption">BƯỚC 2 / 3</p><h2>Chọn ngày và giờ khám</h2><p>{selectedDoctor?.name} · {selectedDoctor?.specialty}</p></div>{slotLoading ? <div className="loading-state" role="status"><Spinner/>Đang tải khung giờ khám…<div className="skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index}/>)}</div></div> : slotError ? <Notice kind="error">{slotError}<Button variant="ghost" onClick={() => act('slots', reloadSlots)}>Tải lại khung giờ</Button></Notice> : !days.length ? <div className="empty-state"><Icon name="calendar" size={28}/><h3>Chưa có khung giờ khám</h3><p>Vui lòng chọn bác sĩ khác hoặc quay lại sau.</p><Button variant="secondary" onClick={() => setStep(1)}>Chọn bác sĩ khác</Button></div> : <><div className="date-strip" role="group" aria-label="Ngày khám">{days.map(key => { const first = slots.find(slot => dateKey(slot.starts_at) === key)!; return <button type="button" data-date={key} key={key} aria-pressed={day === key} className={day === key ? 'selected' : ''} onClick={() => { setDay(key); if (chosen && dateKey(chosen.starts_at) !== key) setChosen(null); }}><span>{weekday(first.starts_at)}</span><strong>{dayLabel(first.starts_at).slice(0, 5)}</strong></button>; })}</div><div className="times-heading"><h3>Khung giờ khám</h3><span>{daySlots.filter(slot => slot.available).length} giờ còn trống</span></div><div className="slot-grid">{daySlots.map(slot => <button type="button" className={`time-slot ${chosen?.id === slot.id && slot.available ? 'selected' : ''} ${!slot.available ? 'unavailable' : ''}`} key={slot.id} data-slot={slot.id} data-available={slot.available} aria-pressed={chosen?.id === slot.id && slot.available} disabled={!slot.available || busy} aria-label={`${timeLabel(slot.starts_at)}, ${slot.available ? 'còn trống' : 'đã hết chỗ'}`} onClick={() => setChosen(slot)}><strong>{timeLabel(slot.starts_at)}</strong><span>{!slot.available ? 'Đã hết chỗ' : chosen?.id === slot.id ? <><Icon name="check" size={13}/>Đã chọn</> : 'Còn trống'}</span></button>)}</div><div className="slot-legend"><span><i className="legend-available"/>Còn trống</span><span><i className="legend-selected"/>Đã chọn</span><span><i className="legend-unavailable"/>Đã hết chỗ</span></div></>}</> : <><div className="step-heading"><p className="step-caption">BƯỚC 3 / 3</p><h2>Xem lại lịch hẹn</h2><p>Vui lòng kiểm tra thông tin trước khi xác nhận.</p></div><dl className="review-details"><div><dt><Icon name="user"/>Bác sĩ</dt><dd><strong>{selectedDoctor?.name}</strong><span>{selectedDoctor?.specialty}</span></dd></div><div><dt><Icon name="calendar"/>Ngày khám</dt><dd>{chosen && dayLabel(chosen.starts_at)}</dd></div><div><dt><Icon name="clock"/>Giờ khám</dt><dd>{chosen && `${timeLabel(chosen.starts_at)} – ${timeLabel(chosen.ends_at)}`}</dd></div><div><dt><Icon name="mail"/>Email nhận thông báo</dt><dd className="break-word">{session.email}</dd></div></dl><Button variant="ghost" disabled={busy} onClick={() => setStep(2)}><Icon name="back" size={17}/>Sửa lịch hẹn</Button><div className="notification-settings"><h3><Icon name="bell"/>Thông báo lịch khám</h3><div className="confirmation-option"><span>Email xác nhận lịch hẹn</span><span className="subtle-badge">Luôn bật</span></div><Toggle id="booking-reminder" checked={effectiveReminder} disabled={busy || !reminderEligible} onChange={setReminder} title="Nhắc lịch qua email" description={reminderEligible ? `Gửi một email nhắc trước giờ khám ${leadLabel(lead)}. Bạn có thể thay đổi trong Lịch hẹn của tôi.` : `Khung giờ này còn dưới ${leadLabel(lead)}. Bạn vẫn nhận được email xác nhận.`}/></div>{!selectedAvailable && <Notice kind="error">Khung giờ này vừa hết chỗ. Các thông tin khác vẫn được giữ; vui lòng chọn lại giờ khám.</Notice>}</>}
        </div><div className="wizard-actions">{step > 1 ? <Button variant="secondary" disabled={busy} onClick={() => { setStep(step - 1); setBanner(null); }}><Icon name="back" size={17}/>Quay lại</Button> : <span className="step-hint">Bạn có thể đổi lựa chọn ở bước tiếp theo.</span>}{step < 3 ? <Button disabled={step === 1 ? !doctorId : !chosen || !selectedAvailable || slotLoading} onClick={() => { setStep(step + 1); setBanner(null); }}>{step === 1 ? 'Tiếp tục' : 'Xem lại lịch hẹn'}<Icon name="next" size={18}/></Button> : <Button busy={pending === 'book'} disabled={busy || !selectedAvailable} onClick={book}>{pending === 'book' ? 'Đang đặt lịch…' : 'Xác nhận đặt lịch'}{!busy && <Icon name="check" size={18}/>}</Button>}</div>
      </section><aside className="booking-aside"><section className="card summary-card"><h2><Icon name="calendar"/>Lịch hẹn của bạn</h2><div className="summary-section"><span>Bác sĩ</span><strong>{selectedDoctor?.name || 'Chưa chọn bác sĩ'}</strong>{selectedDoctor && <p>{selectedDoctor.specialty}</p>}</div><div className="summary-section"><span>Thời gian khám</span><strong>{chosen ? dayLabel(chosen.starts_at) : 'Chưa chọn khung giờ'}</strong>{chosen && <p>{timeLabel(chosen.starts_at)} – {timeLabel(chosen.ends_at)}</p>}</div><div className="summary-note"><Icon name="mail" size={18}/><p>Email xác nhận sẽ được gửi sau khi đặt lịch thành công.</p></div>{chosen && <div className="summary-reminder"><Icon name="bell" size={17}/>{effectiveReminder ? `Nhắc trước ${leadLabel(lead)}` : 'Không bật nhắc lịch'}</div>}</section><section className="booking-help"><h3><Icon name="info" size={18}/>Một vài lưu ý nhỏ</h3><p>Bạn có thể hủy lịch trước giờ khám trong mục Lịch hẹn của tôi.</p><p>Tất cả thời gian hiển thị theo giờ Việt Nam.</p></section></aside></div>}
    </main><footer className="site-footer"><div><span>An Uyên Hospital</span><span>Đặt lịch khám có thông báo</span></div><p>Phiên bản thử nghiệm · Chỉ sử dụng dữ liệu giả lập.</p></footer></div>;
}

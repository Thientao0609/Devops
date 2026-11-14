# Đóng góp

Đọc docs/compliance-matrix.md và docs/architecture.md trước khi đổi mã. Dùng nhánh theo tính năng; commit dạng `feat(api): ...`, `fix(worker): ...`, `docs: ...`. Mọi thay đổi lên main qua PR có ít nhất một review thật. Release dùng tag semver sau checks. Không tự tạo lịch sử đóng góp cho thành viên khác.

Trước PR chạy `.venv/Scripts/python.exe scripts/verify.py`, `npm ci` và `npm run build` trong frontend. Khi có môi trường dịch vụ thật chạy `scripts/verify.py --integration`; mọi skip phải được giải thích. Kiểm tra UI bằng `scripts/check-ui.ps1` (Windows + Edge). Lưu evidence không chứa .env/token/địa chỉ thật. Không đánh dấu test broker pass từ fake channel.

Không commit secret/state/backup dữ liệu. `.env.example` chỉ mô tả cấu hình. Thay đổi contract phải có schema/version; không xóa dữ liệu hoặc chạy migration phá lịch sử trong deploy thông thường. Branch protection, webhook và registry cần người quản trị cấu hình thật, chưa được bật chỉ bởi file này.

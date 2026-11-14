# Security hiện tại và phần chưa đạt

Mốc 1: Argon2 qua pwdlib; JWT HS256 có exp/issuer/audience, secret ≥32 ký tự từ env; UI giữ token ở bộ nhớ. Ownership/admin kiểm tra ở API, UUID/độ dài/timezone được validate. SQLAlchemy tham số hóa; unique index và row locks bảo vệ tính toàn vẹn. Request ID chỉ nhận tập ký tự giới hạn. Lỗi API thống nhất; validation không trả input/password, log không chứa token/DSN/email. Event chỉ chứa ID; lỗi SMTP lưu tên exception thay nội dung provider. Dữ liệu chỉ synthetic .test.

Compose bind DB/broker/metrics/management/Mailpit trên loopback. Backend container non-root/cap_drop/no-new-privileges. Secret không COPY vào image, env example không có credential thật. Cần chạy kiểm tra image/user/volume/health trên engine để xác nhận runtime.

Chưa đạt Bài 11: chưa có Jenkins/gitleaks gate, Trivy image CRITICAL gate, chứng thư cert-manager/HTTPS hoặc RBAC cluster. Không có security scan sạch để công bố. Không dùng ignore-unfixed/continue-on-error cho gate bắt buộc. Credential production không nhập vào .env dev hoặc gửi qua chat; sau này dùng Jenkins Credentials, Ansible Vault và namespace Secret/RBAC.

Giới hạn Mốc 1: login chưa có rate limit theo IP; production cần giới hạn ở ingress và audit phù hợp. SMTP không exactly-once; lease hữu hạn không khóa được hệ thống bên ngoài. Broker/DB một node không HA. API metrics/OpenAPI không có auth ở mạng dev; production phải giới hạn truy cập và tắt public metrics. Dependency pin không chứng minh hết lỗ hổng. Các file Markdown nêu chính sách không thay bằng chứng scanner và runtime.

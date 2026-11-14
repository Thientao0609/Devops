# Quyết định triển khai

Ngày 13/11/2026. Tất cả mục dưới là [THIẾT KẾ], không phải trích nguyên văn rubric.

| ADR | Quyết định và lý do | Trạng thái / kiểm chứng |
|---|---|---|
| 001 | Python/FastAPI theo brief, frontend React/TS; nghiệp vụ gọn để tập trung DevOps | Tạm chọn; cần nhóm đối chiếu backend đã đăng ký. API test + frontend build |
| 002 | PostgreSQL là DB đích; Alembic migration bất biến; seed riêng, dữ liệu .test và slot động 7 ngày | SQLite dùng kiểm tra cục bộ trong khi Docker lỗi; không thay chứng cứ PostgreSQL |
| 003 | Shared package/image cho API/publisher/worker, tách entrypoint và health/metrics | Giảm drift contract/model; cần build và chạy ba container |
| 004 | Transactional outbox, DB unique index, row locks, lease và idempotency | Test biên cục bộ; cạnh tranh PostgreSQL phải chạy riêng |
| 005 | Email SMTP; Mailpit trong dev/test, retry hữu hạn và DLQ/replay có audit | Unit test không thay SMTP/RabbitMQ thật; mailbox thật chưa cấu hình |
| 006 | Môi trường local dự kiến 3 VM, k3s server/agent và Jenkins | CHƯA CHỐT provider: Windows/WSL2, 16 GB RAM. Không viết libvirt áp dụng sai trên Windows; cần host Linux/KVM, Proxmox, VirtualBox hoặc cloud thực |
| 007 | EFK cho logging vì PDF cho phép trực tiếp; không chọn Promtail | Chưa dựng; mọi thay đổi sang Alloy cần đối chiếu rubric. Xem nguồn chính thức trong versions.md |
| 008 | Không tự tạo remote/registry/domain/credentials/commit giả | Chưa có các thông tin này; secret nhập qua .env local/Jenkins Credentials/Vault phù hợp từng mốc |
| 009 | HPA API min2/max5 CPU60%; KEDA worker min1/max5 backlog20 là khởi điểm brief | Chưa benchmark, không phải thông số PDF. Cần resource budget toàn cụm gồm EFK trước khi áp dụng |
| 010 | UI Soft Minimal theo yêu cầu trực tiếp: #286789, Inter tự phục vụ, wizard3bước; logo giữ #103783 | [Thiết kế và kiểm chứng](soft-minimal.md); đây là yêu cầu UI bổ sung, không gán vào PDF |
| 011 | Nhắc email tùy chọn trước60phút, timer bền vững trong DB/publisher, dùng outbox và worker hiện có | UI mặc định bật khi đủ thời gian; API/client cũ mặc định tắt; migration không bật lịch cũ. Test timer truyền đồng hồ + broker/SMTP thật, không hứa exactly-once |

Phương án 1 server + 1 agent không HA control plane; PostgreSQL/RabbitMQ một replica không HA dữ liệu. Không suy ra demo xóa pod API không gián đoạn thành chịu lỗi cả node. PDF trang 3 cho phép k3s/minikube/kind/cloud, nhưng demo máy trắng vẫn cần Terraform và Ansible quản lý tài nguyên thực.

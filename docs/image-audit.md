# Kiểm kê image – không miễn yêu cầu ngầm

PDF trang 2 yêu cầu Dockerfile mỗi service với multi-stage, non-root, HEALTHCHECK, .dockerignore và tag SHA/push. Bảng này chỉ ghi cách triển khai; runtime/build/scan/push có trạng thái riêng trong evidence. Chưa có SHA release, registry push hoặc Trivy gate được chứng minh.

| Service/image dùng | Dockerfile / stages | Runtime user khai báo | Health / công cụ | Nơi dùng | Giới hạn |
|---|---|---|---|---|---|
| API | services/Dockerfile, dependencies→runtime | 10001:10001 | Python urllib /health:8000 | compose api | Image dev dùng chung, chưa push SHA |
| Publisher | Cùng image API, entrypoint clinic.runtime publisher | 10001:10001 | Compose override urllib /health:8001 | compose publisher | Phải kiểm tra entrypoint/health thực; không tự miễn vì dùng chung image |
| Worker | Cùng image API, entrypoint clinic.runtime worker | 10001:10001 | Compose override urllib /health:8002 | compose worker | Cùng giới hạn như publisher |
| Migration/seed | Cùng image, job một lần | 10001:10001 | Exit code, không backend HTTP; health disable cho job | compose migrate/seed | Seed chỉ dev, migration production cần Job điều phối |
| Frontend | frontend/Dockerfile, node build→nginx | nginx | wget /health:8080 | compose frontend | Có .dockerignore riêng; port host18080 mặc định |
| PostgreSQL | images/postgres/Dockerfile, chuẩn bị script→runtime official pinned digest | postgres (Alpine UID70 đã kiểm tra) | /opt/health.sh gọi pg_isready | compose postgres | Health dependency override cũng pg_isready; cần volume ownership đúng |
| RabbitMQ | images/rabbitmq/Dockerfile, enabled_plugins→runtime official | rabbitmq | rabbitmq-diagnostics ping | compose rabbitmq | Plugins thực dùng management và Prometheus; vhost dev riêng |
| Mailpit upstream | axllent/mailpit:v1.27.10 trực tiếp, chưa Dockerfile custom | Compose user1000:1000 | /mailpit readyz | compose mailpit | Chưa đáp ứng Dockerfile multi-stage riêng/scan/push theo diễn giải chặt; không coi upstream được miễn, cần hoàn thiện Mốc 2 |
| Monitoring/exporters | Chưa chọn image/chart | Chưa có | Chưa có | Mốc 3–4 | Phải bổ sung vào bảng và xác minh; không đánh dấu đủ Docker cho toàn hệ thống |

Các build dev đã thực hiện không thay build theo commit SHA, scan CRITICAL và push digest registry. Docker healthcheck khác Kubernetes probes; cần cả hai theo rubric. Đối chiếu `Config.User`, `Config.Healthcheck`, effective health override và kết quả chạy non-root/volume sau build; không chỉ đọc USER từ Dockerfile rồi coi VERIFIED.

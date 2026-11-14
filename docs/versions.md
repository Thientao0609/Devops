# Phiên bản, nguồn kỹ thuật và phạm vi xác nhận

Cập nhật 14/11/2026 (Asia/Ho_Chi_Minh). Không dùng tag latest. Pin không thay security scan. `requirements.in` là phạm vi đầu vào, **requirements.lock** ghim toàn bộ Python đã resolve; frontend package-lock.json có phiên bản và integrity. Chưa có Terraform/provider/chart lock vì chưa chọn host/provider hoặc cài cluster.

| Thành phần | Phiên bản chọn / môi trường quan sát | Lý do / giới hạn |
|---|---|---|
| Python | Host 3.12.6; image mới3.12.16-slim-trixie ghim digest trong Dockerfile | Nền M1 cũ3.12.12-bookworm có9CRITICAL; nền mới remote scan0CRITICAL, custom image chưa build/run/scan |
| FastAPI / SQLAlchemy / Alembic | 0.162.6 / 2.0.57 / 1.20.1 | Resolve trong phạm vi requirements.in và kiểm tra thực; API SQLAlchemy 2.0 được giữ riêng |
| psycopg / Pika | 3.3.9 / 1.4.4 | Driver PostgreSQL và AMQP blocking confirms/manual ack |
| Prometheus client / PyJWT / pwdlib | 0.26.0 / 2.15.1 / 0.3.1 | Metrics, JWT có expiry và Argon2; tất cả trong lock |
| Pydantic settings / pytest / Ruff | 2.16.3 / 9.2.0 / 0.17.5 | Env config, checks; Starlette 1.10.0 hiện cảnh báo TestClient/httpx deprecation, chưa bỏ cảnh báo để che lỗi |
| PostgreSQL | 17.12-alpine3.24, digest `sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f` | Variant chính thức đã đọc passwd/user/version. Bookworm local có passwd rỗng; không kết luận lỗi upstream. Dùng volume mới `postgres-data-alpine`, không xóa volume cũ |
| RabbitMQ | 4.2.9-management | Quorum retry + at-least-once DLX; bật management/Prometheus plugins; broker dev một node không HA |
| Mailpit | v1.33.1 ghim digest, binary sang Alpine3.24 | Nguồn cũ1.27.10 có3CRITICAL; nguồn mới remote scan0CRITICAL. Custom image/SMTP test sau upgrade chưa chạy |
| Node / React / TypeScript / Vite | Host/build Node24.22.1; React19.2.0; TS5.9.3; Vite7.2.2 | Node build dùng Alpine3.24; agent dùng trixie-slim; native build đã chạy, build image mới chưa chạy |
| Nginx / Playwright | 1.30.6-alpine3.24 ghim digest / 1.65.0 | Nền cũ1.28.0 có3CRITICAL/EOL Alpine; nền mới remote scan0CRITICAL. Frontend image mới chưa chạy |
| Inter / Fontsource | @fontsource/inter 5.3.0, lockfile npm | Font Inter tự phục vụ, gồm tiếng Việt và weight400/500/600; SIL OFL1.1 |
| Docker | Đầu phiên CLI 29.4.0/Desktop 4.69.0; sau phục hồi CLI/engine 29.9.3, Desktop 4.99.0, Compose v5.7.0 | Ghi đúng môi trường thay đổi trong phiên; không ghim phiên bản Docker của máy thay người dùng |
| ESLint / TypeScript ESLint / React Hooks | 10.15.0 / 8.72.2 / 7.1.1; @eslint/js10.0.1, globals17.14.0 | Exact versions/lockfile; nguồn npm registry chính thức; lint native đạt. ESLint9 đã EOL nên không giữ bộ cài thử9.39.1 |
| Gitleaks / Trivy | 8.30.1 / 0.76.2 | Native binary đối chiếu SHA256 release chính thức; image CI cùng phiên bản; chưa có scan release image |
| Jenkins / inbound agent | 2.580.1-jdk21 / 3391.va_37fa_a_305d6d-5-jdk21 | ci/tools.json và Dockerfile; parser Jenkins cũ đã validate, controller mới chưa build/run |
| Jenkins plugins | ci/controller/plugins.txt, plugins-lock.json | 8 direct plugins, chọn bản compatible core từ update center chính thức; transitive resolver --latest=false chưa chạy, cần lưu kết quả khi build |

Nguồn Mốc2 kiểm tra14/11/2026: [Jenkins update center](https://updates.jenkins.io/update-center.actual.json), [Gitleaks releases](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [Trivy releases](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2), npm registry của eslint/typescript-eslint/react-hooks. Dockerfile CI ghi tag cụ thể; chưa coi pin tag là bằng chứng image đã build hoặc không CVE.

Tài liệu chính thức đã đọc để chọn cách triển khai:

- [RabbitMQ publisher confirms và consumer acknowledgements](https://www.rabbitmq.com/docs/confirms): hai cơ chế xác nhận độc lập; dùng mandatory để phát hiện thiếu route và manual ack sau khi xử lý.
- [RabbitMQ 4.2 quorum queues](https://www.rabbitmq.com/docs/4.2/quorum-queues): kiểm tra tính năng retry TTL/dead lettering theo dòng 4.2. Quorum một node vẫn là điểm lỗi chung.
- [Pika documentation](https://pika.github.io/pika/latest/): BlockingConnection, confirms, exceptions và thread ownership; mỗi role giữ connection trong thread xử lý của nó.
- [SQLAlchemy 2.0 transactions](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html) và [PostgreSQL dialect](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html): transaction/session, row locks và partial index. Migration đã tạo là snapshot explicit, không gọi metadata.create_all thay migration.
- [FastAPI security](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/): hashing và token có hạn; quyền sở hữu/admin bổ sung theo nghiệp vụ đồ án.
- [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): health dependency và tác vụ completed; app vẫn phải reconnect khi dependency lỗi sau startup.
- [PostgreSQL official image](https://hub.docker.com/_/postgres), [RabbitMQ official image](https://hub.docker.com/_/rabbitmq): tag/variant và upstream source. Digest thực cùng inspect output phải lưu trong evidence.

Nguồn trong brief cần kiểm tra lại khi đến Mốc 3–4, chưa xem là cấu hình đã chạy: [KEDA RabbitMQ 2.21](https://keda.sh/docs/2.21/scalers/rabbitmq-queue/), [Kubernetes HPA](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/), [Promtail lifecycle](https://grafana.com/docs/loki/latest/send-data/promtail/), [libvirt provider](https://registry.terraform.io/providers/dmacvicar/libvirt/latest/docs/resources/domain). Không ghim KEDA/libvirt chỉ từ liên kết khi chưa chọn nền tảng và kiểm tra tương thích thực.

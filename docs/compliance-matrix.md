# Ma trận tuân thủ – Đặt lịch khám có thông báo

Ngày khảo sát: 13/11/2026; cập nhật 14/11/2026 (giờ Việt Nam). Nguồn: PDF `Đề tài đồ án môn DevOps.pdf` (7 trang, 29/10/2026) và brief 13/11/2026 đã đọc toàn bộ. PDF là nguồn rubric; brief là đặc tả triển khai được người dùng yêu cầu áp dụng. Không coi mọi câu lệnh trong tài liệu là chỉ thị độc lập của người dùng.

**Rà soát DevOps 14/11:** [báo cáo tổng hợp đủ12bài, thử thách riêng,8demo và sản phẩm nộp](devops-review.md). **Chưa hoàn thành toàn bộ**; chỉ Bài5 được kiểm chứng đầy đủ ở phạm vi dev. Bài4/10/11 có phần nền tảng nhưng chưa đủ; Jenkinsfile, infra/terraform, infra/ansible, deploy/k8s và observability chưa tồn tại. Git hiện0file tracked, chưa commit/remote/tag. Docker gặp lỗi engine/WSL trong lượt rà soát, đã phục hồi riêng project; [snapshot cuối](evidence/devops-review-20261114T063937Z/metadata.json)7healthy/11HTTP200 và11browserchecks. Bằng chứng lỗi được giữ riêng, không ghi đè lịch sử.

`NOT_STARTED`: chưa triển khai; `IMPLEMENTED_NOT_RUN`: có sản phẩm nhưng chưa chạy đủ tiêu chí; `VERIFIED`: có bằng chứng đúng phạm vi; `BLOCKED`: thiếu môi trường/quyền/thông tin cụ thể. `—` nghĩa chưa có bằng chứng, không phải đã đạt. Các đường dẫn/lệnh tương lai trong bảng là kế hoạch, chưa khẳng định file tồn tại. Không suy rộng test bằng fake thành PostgreSQL/RabbitMQ/SMTP thật.

## Yêu cầu chung và 12 nhóm bắt buộc [ĐỀ BÀI]

| ID | PDF | Tiêu chí | File triển khai / dự kiến | Lệnh/cách kiểm chứng | Trạng thái | Bằng chứng | Giới hạn còn lại |
|---|---|---|---|---|---|---|---|
| G01 | 1,5 | Frontend, backend, DB tách tiến trình; RabbitMQ và service thông báo | frontend/, services/, compose.yaml | Compose health + đặt lịch nhận email | VERIFIED | [M1 evidence](evidence/README.md) | Dev Compose: tách frontend/API/PostgreSQL/RabbitMQ/publisher/worker/Mailpit; chưa production |
| G02 | 1 | Mọi backend có /health, /metrics, log JSON stdout, env config | services/clinic/, compose.yaml | scripts/collect-runtime.py; smoke worker delay/recovery | VERIFIED | [Inspection](evidence/inspection-20261114T063904Z/metadata.json) | Dev3backend health/ready/metrics đều200; log stdout được kiểm tra JSON trong snapshot mới; env worker delay đã kiểm chứng rồi gỡ. Chưa scrape/EFK |
| G03 | 1 | Mọi mã/cấu hình trong Git, bước thủ công có runbook, ghi nguồn OSS | README.md, docs/, THIRD_PARTY.md | git ls-files; tái dựng theo runbook | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Git cục bộ đã init; chưa commit/remote. Có architecture/runbook/THIRD_PARTY; IaC/CI/K8s chưa triển khai |
| G04 | 1 | Nhóm 3–4, hiểu toàn bộ; đề tài tối đa 2 nhóm và backend khác nhau | docs/team-workflow.md | Đối chiếu danh sách đăng ký và vấn đáp | BLOCKED | — | Cần nhóm xác nhận đăng ký; không tạo lịch sử giả |
| D01 | 2 | Phân vai, kênh trao đổi, DoD, sơ đồ tổng thể | docs/team-workflow.md, docs/architecture.md | Review tài liệu + tên/kênh thực | BLOCKED | [M1 evidence](evidence/README.md) | Có DoD/sơ đồ/vai trò dự kiến; cần tên 3–4 thành viên và kênh trao đổi thật |
| D02a | 2 | GitHub/GitLab, main protection, PR có ≥1 review | CONTRIBUTING.md, .github/pull_request_template.md | API/UI repo remote, PR đã merge, branch rules | BLOCKED | — | Chưa có remote/quyền quản trị |
| D02b | 2 | Conventional Commits, semver tag, mỗi người có commit | CONTRIBUTING.md | git log; git tag; thống kê tác giả thật | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có CONTRIBUTING/PR template; chưa commit thật, semver tag hoặc đủ tác giả |
| D03a | 2 | Bash backup DB theo cron/timer và health host | scripts/backup.sh, scripts/host-health.sh, infra/ansible/ | bash -n; timer log; mở backup kiểm tra | NOT_STARTED | — | Cần Linux, DB và nơi lưu ngoài vòng đời DB |
| D03b | 2 | User riêng, SSH key, cấm root SSH, UFW | infra/ansible/ | sshd -T; ufw status; SSH user vận hành | NOT_STARTED | — | Chưa có VM mục tiêu |
| D04a | 2 | Dockerfile mỗi service, multi-stage, non-root, HEALTHCHECK, .dockerignore | services/Dockerfile, frontend/Dockerfile, images/, docs/image-audit.md | build; image inspect; chạy user/health từng image | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Các image app/frontend/DB/broker đã build/chạy; Mailpit upstream chưa Dockerfile riêng, monitoring/exporter chưa có. Xem image-audit.md |
| D04b | 2 | Tag commit SHA, push Docker Hub/GHCR | Jenkinsfile, release manifest | registry digest đối chiếu commit và image đang chạy | BLOCKED | — | Chưa có remote registry/credential |
| D05 | 2 | Một lệnh compose up; healthy dependencies, network, volume, env example | compose.yaml, .env.example | docker compose config; up --wait; restart dependency | VERIFIED | [Devops review](evidence/devops-review-20261114T063937Z/metadata.json) | Compose dev up/build/wait thành công; jobs migration/seed exit0; broker restart có recovery. Dùng port18080, giữ Jenkins8080 |
| D06a | 2 | Declarative checkout/lint/unit/build/scan/push/staging/approval/prod | Jenkinsfile | Build Jenkins thật và archive reports | NOT_STARTED | — | Tạo file chưa đủ |
| D06b | 2 | Webhook push/PR, Jenkins Credentials | docs/ci-cd.md | delivery webhook → build; credential IDs được che | BLOCKED | [M1 evidence](evidence/README.md) | Phát hiện my-jenkins đang chạy8080; chưa nối SCM/credential/webhook/pipeline của đồ án, không thay đổi Jenkins hiện có |
| D07a | 3 | Ansible roles: máy trắng Docker/k3s/Jenkins agent/node exporter; inventory theo env | infra/ansible/ | syntax-check; playbook trên VM sạch | NOT_STARTED | — | Ansible chưa cài; chưa có VM |
| D07b | 3 | Lần hai idempotent, secret Ansible Vault | infra/ansible/ | recap lần hai changed=0; vault view ngoài log | NOT_STARTED | — | Không che mutation bằng changed_when:false |
| D08a | 3 | Terraform tạo VM/mạng/firewall/DNS nếu có; local provider VirtualBox/libvirt/Proxmox | infra/terraform/ | fmt; validate; plan; apply → tài nguyên thực | BLOCKED | — | Chưa có Terraform/provider mục tiêu |
| D08b | 3 | Variables, outputs, ≥1 module tự viết; không commit state | infra/terraform/, .gitignore | validate; outputs; git ls-files rà state/tfvars | NOT_STARTED | — | Không thay VM thật bằng null_resource shell |
| D09a | 3 | K8s Deployment/Service/Ingress/ConfigMap/Secret; staging/prod tách namespace | deploy/k8s/ | kubectl apply; get; kiểm tra isolation | NOT_STARTED | — | PDF cho phép k3s/minikube/kind/cloud; k3s là thiết kế brief |
| D09b | 3 | Liveness/readiness, requests/limits, HPA CPU | deploy/k8s/, tests/load/ | probe fault; load HTTP; HPA/replica timeline | NOT_STARTED | — | Không dùng file YAML làm evidence scale |
| D09c | 3,6 | Rolling update, rollback; demo không gián đoạn | scripts/, tests/load/ | request loop + rollout/rollback timeline, lỗi/p95 | NOT_STARTED | — | Brief chọn ≥2 frontend/API, graceful drain |
| D10a | 3 | Prometheus/Grafana CPU/RAM/request rate/error rate/p95 từng service | observability/ | query metrics; export JSON; dashboard khi có tải | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có metrics ứng dụng và RabbitMQ exporter; chưa Prometheus/Grafana/dashboard/p95 per-service đầy đủ |
| D10b | 3 | Alertmanager gửi Telegram/Discord/email thật | observability/, docs/runbooks/ | FIRING và RESOLVED thực đến kênh nhận | BLOCKED | — | Chưa có receiver; demo bước 5 yêu cầu Telegram/Discord |
| D10c | 3 | Loki+Promtail hoặc EFK; lọc service và level | observability/logging/ | tìm request lỗi và correlation trên Kibana | NOT_STARTED | — | Chọn EFK; Alloy là thay thế cần xác nhận nếu đổi |
| D11a | 3 | Không secret Git; gitleaks trong pipeline | .gitignore, Jenkinsfile | gitleaks + demo secret giả chặn deploy | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có ignore/env random và tài liệu; chưa chạy gitleaks trong pipeline, không tuyên bố scan sạch |
| D11b | 3 | Trivy image, CRITICAL chặn build | Jenkinsfile | Trivy exit-code 1 + ảnh lỗi có chủ đích | NOT_STARTED | — | Không ignore-unfixed để lách gate |
| D11c | 3 | Ingress HTTPS cert-manager; RBAC tối thiểu | deploy/k8s/ | cert Ready; HTTPS trust; kubectl auth can-i | NOT_STARTED | — | Chưa có cluster/domain/CA |
| D12 | 3 | Production cloud hoặc local kèm bảng chi phí lên cloud | docs/cloud-cost-estimate.md | nguồn giá/ngày/region/cấu hình/giờ/disk/egress | BLOCKED | — | Chưa chọn host/provider; không bịa giá |

## Thử thách đề tài số 8 [ĐỀ BÀI, trang 5]

| ID | PDF | Tiêu chí | File triển khai / dự kiến | Lệnh/cách kiểm chứng | Trạng thái | Bằng chứng | Giới hạn còn lại |
|---|---|---|---|---|---|---|---|
| T08a | 5 | Kiến trúc sự kiện với RabbitMQ và email/Telegram | contracts/, services/ | Booking → outbox → broker → worker → hộp thư | VERIFIED | [M1 evidence](evidence/README.md) | Luồng event-driven dev thật đến SMTP Mailpit; chưa mailbox ngoài. RabbitMQ/KEDA toàn thử thách vẫn chưa đủ |
| T08b | 5 | Giám sát độ dài queue | observability/ | Ready/unacked/backlog/consumer/DLQ trên dashboard | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Đã bật management/Prometheus listener; chưa dashboard queue/Prometheus scrape được nghiệm thu |
| T08c | 5 | Consumer scale theo queue bằng KEDA | deploy/k8s/, tests/load/queue* | Burst → backlog → worker tăng → queue rút → giảm | NOT_STARTED | — | Không thay bằng HPA CPU; một bộ điều khiển worker |

## Tám bước demo [ĐỀ BÀI, trang 6]

20 phút demo + 10 phút vấn đáp. Video dự phòng tối đa 10 phút là sản phẩm riêng. Mỗi bước cần người phụ trách thực, timestamp và cách reset; chưa phân công tên khi chưa có thông tin nhóm.

| ID | PDF | Phải chứng minh | File / dự kiến | Kiểm chứng | Trạng thái | Bằng chứng | Giới hạn |
|---|---|---|---|---|---|---|---|
| DEMO1 | 6 | terraform apply → ansible-playbook máy trắng → K8s lên | infra/, docs/demo-script.md | apply output, recap, nodes Ready | BLOCKED | — | Chưa có 3 VM/provider |
| DEMO2 | 6 | Code push → Jenkins → staging → duyệt → production liên tục | Jenkinsfile, scripts/ | webhook/build/approval/digest/request loop | BLOCKED | — | Chưa có remote/pipeline đồ án/cluster; container Jenkins có sẵn không đồng nghĩa đã nối pipeline |
| DEMO3 | 6 | Secret giả/dependency lỗi bị pipeline chặn | tests/security/ | failed gate, scanner report, không deploy mới | NOT_STARTED | — | Không dùng secret thật |
| DEMO4 | 6 | Xóa pod → tạo lại, dịch vụ liên tục | tests/load/ | timeline và request loop không lỗi | BLOCKED | — | Chưa có cluster |
| DEMO5 | 6 | Load → HPA → Grafana → Telegram/Discord | tests/load/, observability/ | RPS/p95/errors, replicas, tin nhận thật | BLOCKED | — | Cần cluster và receiver |
| DEMO6 | 6 | Bản lỗi → monitoring phát hiện → rollback ≤2 phút | scripts/rollback*, docs/runbooks/ | timestamp lỗi/phát hiện/recovery + smoke | BLOCKED | — | Chưa có deployment/monitoring |
| DEMO7 | 6 | Request lỗi truy ra log tập trung | docs/runbooks/ | request_id và truy vấn Kibana | NOT_STARTED | — | Chưa có EFK |
| DEMO8 | 5,6 | RabbitMQ backlog → KEDA scale worker → thông báo | tests/load/, deploy/k8s/ | queue/replica/email cùng timeline | BLOCKED | — | Chưa có KEDA/cluster |

## Toàn bộ sản phẩm nộp [ĐỀ BÀI, trang 6]

| ID | PDF | Sản phẩm | File / dự kiến | Kiểm chứng | Trạng thái | Bằng chứng | Giới hạn |
|---|---|---|---|---|---|---|---|
| SUB1 | 6 | Link repo app/hạ tầng và README dựng toàn bộ từ máy trắng | README.md, remote Git | Người khác tái dựng theo README trên máy sạch | BLOCKED | — | Chưa có remote; monorepo được dùng |
| SUB2a | 6 | Báo cáo kiến trúc, pipeline, lý do công nghệ, bảng phân công | docs/architecture.md, docs/report.md, docs/team-workflow.md | Review đối chiếu hệ thống thật | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có architecture/ADR/DoD; thiếu báo cáo cuối/sơ đồ pipeline/tên phân công |
| SUB2b | 6 | Kết quả load test | docs/load-test-results.md | Raw load output + resource/replica timeline | NOT_STARTED | — | Không lấy số minh họa |
| SUB2c | 6 | ≥1 postmortem sự cố thực nhóm gặp | docs/postmortem.md | Review timeline/tác động/giả thuyết/evidence/action và owner thực | IMPLEMENTED_NOT_RUN | [Bản kỹ thuật](postmortem.md) | Có sự cố triển khai đã quan sát, tách riêng fault injection; cần nhóm review/gán owner/hạn, chưa coi sản phẩm nhóm hoàn tất |
| SUB3a | 6 | Runbook deploy | docs/runbooks/deploy.md | Người khác deploy theo runbook | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Runbook dev đã dùng; quy trình Kubernetes staging/production chưa thực thi |
| SUB3b | 6 | Runbook rollback | docs/runbooks/rollback.md | Release cũ, config tương ứng, smoke và thời gian | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có phạm vi/quy trình cần làm; chưa release/rollback thực, không thay bằng worker recovery |
| SUB3c | 6 | Runbook khôi phục DB | docs/runbooks/restore.md | Restore vào DB thử và kiểm tra dữ liệu | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có quy trình restore cần hoàn thiện; chưa backup/restore artifact hoặc diễn tập |
| SUB3d | 6 | Runbook cho từng loại cảnh báo | docs/runbooks/alerts.md | Fault → điều tra → xử lý → RESOLVED | IMPLEMENTED_NOT_RUN | [M1 evidence](evidence/README.md) | Có danh sách alert/điều tra/xử lý; chưa rules hoặc FIRING/RESOLVED thật |
| SUB4 | 6 | Video demo ≤10 phút | docs/submission.md | Mở video, kiểm tra thời lượng và nội dung thật | NOT_STARTED | — | Chưa quay video |
| SUB5 | 6 | Grafana dashboard export và alert rules | observability/ | Import/query được; promtool; alert thật | NOT_STARTED | — | Chưa có Grafana/Prometheus |

## Tiêu chí thiết kế Mốc 1 [THIẾT KẾ từ brief, không phải nguyên văn PDF]

| ID | Nguồn | Tiêu chí | File / dự kiến | Kiểm chứng | Trạng thái | Bằng chứng | Giới hạn |
|---|---|---|---|---|---|---|---|
| M1-API | Brief §4–5 | Auth/ownership/admin, slot UTC, trạng thái hợp lệ | services/ | pytest API/integration | VERIFIED | [Suite30](evidence/integration-20261113T192650Z/metadata.json) | 30unit+integration trên Linux/PostgreSQL, trong đó5test adapter RabbitMQ/SMTP thật; không gọi cả30là test SMTP. Backend đăng ký lớp vẫn cần nhóm xác nhận |
| M1-DB | Brief §4–5 | Migration, seed lặp an toàn, unique slot, idempotency nguyên tử | services/, tests/ | DB PostgreSQL thật + concurrent requests | VERIFIED | [M1 evidence](evidence/README.md) | Migration/seed/unique slot và đồng thời khác/trùng key đã kiểm tra trên PostgreSQL, không suy từ SQLite |
| M1-EVT | Brief §5–6 | Outbox transaction, claim lease, confirms/mandatory, stale events | contracts/, services/ | Broker outage/recovery, unroutable, stale test | VERIFIED | [M1 evidence](evidence/README.md) | Broker stop→booking/outbox→phục hồi gửi; mandatory/unroutable/stale/lease tests. Multi-publisher load chưa đo |
| M1-WRK | Brief §6 | Retry hữu hạn/backoff/DLQ, dedupe bền vững, lease, replay audit | services/, scripts/ | SMTP fail, retry, redelivery, DLQ/replay | VERIFIED | [M1 evidence](evidence/README.md) | Retry/DLQ/replay/dedupe SMTP thật; kill worker trước ack khôi phục 114.781s với lease120s. Đây không phải demo rollback≤120s |
| M1-UI | Brief §4 | UI Việt, loading/empty/error/success, patient/admin gọi API | frontend/ | npm run build; frontend/tests/smoke.cjs | VERIFIED | [UI Compose11](evidence/ui-double-check-20261114T054401Z/metadata.json) | 11checks browser qua Nginx/API/PostgreSQL/RabbitMQ/Mailpit; auditUI15checks giả lập lỗi có scope riêng. Không thay bằng chứng8demo DevOps |

## Ranh giới rubric và kế hoạch

- 4 mốc/15 tuần và phạt trễ 0,25/mốc là PDF trang 6; nội dung Mốc 1–4 trong brief là kế hoạch đề xuất, chưa có lịch tuần chính thức.
- PDF trang 3 cho phép k3s/minikube/kind/cloud; brief chọn 3 VM (Jenkins + k3s server/agent). Kind đơn lẻ không chứng minh Terraform dựng 3 VM theo thiết kế này.
- React/FastAPI/PostgreSQL, outbox, lease, retry 10/30/60s, HPA min 2/max 5/CPU 60%, KEDA min 1/max 5/value 20, Mailpit, ≥2 frontend/API, JSON correlation là lựa chọn thiết kế, cần đo thực.
- Helm/Kustomize, StatefulSet, PDB, restore drill, DORA, Molecule, NetworkPolicy, Vault/Sealed Secrets, cosign, tracing/SLO… thuộc nâng cao. Làm sau bắt buộc. KEDA luôn bắt buộc cho đề tài 8.
- Đạt cột bắt buộc chỉ tối đa 70% từng hạng mục (PDF 6–7). Độ khó 4 sao không bảo đảm điểm cuối; không tạo commit/review/evidence giả.

## Khảo sát ban đầu và điều kiện tiếp tục

Workspace `D:\CODE\OOPs\Do_An` rỗng, chưa là Git repo; không có AGENTS.md tại workspace hoặc các thư mục cha đã kiểm tra. Máy Windows, Python 3.12.6, Node 24.22.1/npm 11.6.0, Docker CLI 29.4.0, WSL2 Ubuntu 22.04; RAM vật lý 16.87 GB, ổ D còn khoảng 77.35 GB theo khảo sát. Docker daemon chưa chạy ở lần đầu; đã yêu cầu khởi động Docker Desktop. Terraform/Ansible/VirtualBox/psql/RabbitMQ native chưa có trong PATH. Sandbox ban đầu chặn Docker config/WSL/CIM; kiểm tra có quyền ngoài sandbox xác nhận daemon vẫn chưa có pipe.

Lịch sử trên là khảo sát ban đầu. Cập nhật: Docker đã phục hồi (CLI/engine29.9.3, Desktop4.99.0, Compose5.7.0); stack dev đã healthy và Mốc1 có integration/browser/fault evidence thật. Có container my-jenkins đang dùng8080, frontend dùng18080; chưa cấu hình pipeline/SCM/credential của đồ án và không sửa Jenkins hiện có. Không có Kubernetes context/Terraform/Ansible/provider/remote registry/domain/receiver được xác nhận. Bằng chứng có thời điểm, lệnh, môi trường, UNCOMMITTED/source hash, exit code và raw output; các thất bại được giữ nguyên.

## Acceptance của brief [THIẾT KẾ, không phải tiêu chí nguyên văn PDF]

| ID | Nguồn | Tình huống / cách kiểm chứng | File | Lệnh | Trạng thái | Bằng chứng | Giới hạn |
|---|---|---|---|---|---|---|---|
| AC01 | Brief §11 | Dev Compose healthy và UI thao tác thật | compose.yaml, frontend/ | compose up/build/wait; UI smoke | VERIFIED | [M1](evidence/README.md) | Chỉ dev hiện tại, chưa máy trắng IaC |
| AC02 | Brief §11 | Booking→outbox→RabbitMQ→SMTP email body→SENT | scripts/smoke-runtime.py | smoke-runtime.py --faults | VERIFIED | [Runtime](evidence/runtime-20261113T173308Z/metadata.json) | Mailpit, chưa mailbox ngoài |
| AC03 | Brief §11 | Hai request cùng slot chỉ1hiệu lực,201/409 | tests/test_api.py | check-integration.ps1 | VERIFIED | [Integration](evidence/README.md) | PostgreSQL thật; chưa benchmark tải lớn |
| AC04 | Brief §11 | Cùng key/payload, kể cả đồng thời, chỉ1appointment/outbox; khác payload409 | tests/test_api.py | check-integration.ps1 | VERIFIED | [Integration](evidence/README.md) | Theo user/operation, response snapshot |
| AC05 | Brief §11 | Ownership và admin boundary | tests/test_api.py, frontend/tests/smoke.cjs | Integration + browser | VERIFIED | [M1](evidence/README.md) | Backend và UI đã kiểm tra |
| AC06 | Brief §11 | Broker stop, booking/outbox giữ, recovery; pending/alert | scripts/smoke-runtime.py, observability/ dự kiến | smoke + alert receiver | IMPLEMENTED_NOT_RUN | [Runtime](evidence/runtime-20261113T173308Z/metadata.json) | Outage/recovery/pending đã pass; chưa có alert thực nên toàn dòng chưa VERIFIED |
| AC07 | Brief §11 | SMTP thật connection-refused, retry hữu hạn, DLQ | tests/test_integration.py | check-integration.ps1 | VERIFIED | [Integration](evidence/README.md) | Test backoff1/2/3s; dev mặc định10/30/60s; không dùng SMTP thật cho tải |
| AC08 | Brief §11 | Redeliver SENT không gửi thêm mail | tests/test_integration.py | check-integration.ps1 | VERIFIED | [Integration](evidence/README.md) | Chỉ sau DB đã ghi SENT; crash window SMTP vẫn có thể trùng |
| AC09 | Brief §11 | Worker SIGKILL trước ack, lease/redelivery phục hồi | scripts/smoke-runtime.py | smoke-runtime.py --faults | VERIFIED | [Runtime](evidence/runtime-20261113T173308Z/metadata.json) | Recovery114.781s, gỡ delay demo; không phải rollback app |
| AC10 | Brief §11 | Security gate thật chặn pipeline/push/deploy | Jenkinsfile/tests/security/ dự kiến | gitleaks/Trivy failed build | NOT_STARTED | — | Chưa Jenkinsfile/gate; không coi env hygiene là scan |
| AC11 | Brief §11 | HTTP CPU→HPA API | deploy/k8s/, tests/load/ dự kiến | k6 + kubectl/Grafana | NOT_STARTED | — | Chưa cluster/HPA/load |
| AC12 | Brief §11 | Backlog→KEDA worker tăng/rút/giảm | deploy/k8s/, tests/load/ dự kiến | burst + metrics + replicas | NOT_STARTED | — | KEDA bắt buộc đề tài8, chưa triển khai |
| AC13 | Brief §11 | Rollout/xóa pod không lỗi request loop | deploy/k8s/ dự kiến | request loop/rollout/timeline | NOT_STARTED | — | Proxy recovery đơn replica dev không chứng minh không gián đoạn K8s |
| AC14 | Brief §11 | Rollback app≤120s từ phát hiện→smoke tốt | scripts/rollback/runbook dự kiến | Fault release + recovery timeline | NOT_STARTED | — | Không lấy worker recovery114.781s thay tiêu chí này |
| AC15 | Brief §11 | Log EFK tìm request lỗi, alert receiver thật | observability/ dự kiến | Kibana query + FIRING/RESOLVED | NOT_STARTED | — | JSON stdout hiện tại chưa là EFK hoặc Alertmanager |
| AC16 | Brief §11 | Terraform VM, Ansible lần2 ổn định, backup/restore | infra/, scripts/ dự kiến | apply/playbook/timer/restore | BLOCKED | — | Chưa provider/VM/tool và chưa backup artifact |

## Giao diện bổ sung [YÊU CẦU NGƯỜI DÙNG, KHÔNG PHẢI RUBRIC PDF]

| ID | Nguồn | Tiêu chí | File | Cách kiểm chứng | Trạng thái | Bằng chứng | Giới hạn |
|---|---|---|---|---|---|---|---|
| UI01 | User14/11/2026 | Soft Minimal: palette#286789, Inter, thẻ12px, responsive; logo#103783 | frontend/src/, frontend/public/brand/ | Đo CSS/font/hash và bố cục320/390/768/1440px, xem ảnh | VERIFIED | [Inspection](evidence/soft-minimal-inspection-20261114T054357Z/metadata.json) | 12layout probes cho login/chọn giờ/xem lại; không thay accessibility audit đầy đủ |
| UI02 | User14/11/2026 | Đặt lịch từng bước, xem lại, phân biệt giờ bận/đã chọn; pending/thành công/lỗi, giữ dữ liệu khi retry | frontend/src/App.tsx, frontend/tests/soft-minimal-smoke.cjs | Browser trên stack Compose, cố ý chặn request rồi503, thử lại cùng key | VERIFIED | [11checks](evidence/ui-double-check-20261114T054401Z/metadata.json) | Dữ liệu synthetic; session trong bộ nhớ; chưa production |
| UI03 | User: công tắc nhắc; thiết kế: trước60phút | Nhắc email có lưu, đến hạn qua outbox/RabbitMQ/worker, tắt/hủy chặn tác vụ | services/clinic/reminders.py, tests/test_reminders.py, tests/test_integration.py | Migration head; test timer/khóa và SMTP; PATCH bật/tắt qua UI | VERIFIED | [Suite30](evidence/integration-20261113T192650Z/metadata.json), [thiết kế](soft-minimal.md) | Test truyền đồng hồ tương lai, không chờ1giờ thực. Mailpit local; SMTP vẫn có crash/race window. KEDA/monitoring chưa đạt từ tính năng này |

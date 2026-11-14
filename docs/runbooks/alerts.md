# Xử lý cảnh báo – kế hoạch, chưa nghiệm thu

Chưa có Alertmanager/Grafana/EFK hoặc receiver thật; chưa có FIRING/RESOLVED. Mỗi dòng dưới cần alert rule, đường dẫn runbook từ rule và diễn tập riêng; ngưỡng chốt sau khi đo tải.

| Alert cần có | Điều tra | Xử lý / tiêu chí khôi phục |
|---|---|---|
| Service down | Target/up, pod state, events, dependency readiness | Phục hồi nguyên nhân; health/ready và smoke đạt; nhận RESOLVED |
| HTTP 5xx cao | Route/error rate, request_id trong log EFK, thay đổi release | Sửa dependency hoặc rollback; lỗi về baseline, smoke đạt |
| Latency p95 cao | Histogram nghiệp vụ, CPU/RAM/DB, queue delay tách processing | Điều chỉnh nghẽn theo số đo; p95 về ngưỡng |
| Queue backlog kéo dài | ready+unacked, consumer count, KEDA/HPA events, SMTP | Khôi phục consumer/provider; scale trong budget; backlog rút |
| Backlog nhưng không consumer | worker logs/ready, credentials/vhost, deployment desired | Khôi phục worker và xác minh ack throughput |
| DLQ >0 | Event/attempt/reason đã che thông tin | Sửa nguyên nhân rồi replay chọn lọc theo notifications.md; không purge che lỗi |
| Outbox quá hạn | pending age, DB lease, publisher confirms/route/broker | Phục hồi publisher/route, outbox được publish; không đánh dấu SQL bằng tay |
| CPU/RAM cao | Pod/node requests/limits, OOM/restart, capacity | Giảm tải hoặc tăng tài nguyên có budget; ổn định đủ thời gian |
| Backup lỗi/quá cũ | Timer exit, disk/permission/DB connectivity/checksum | Sửa và tạo backup mới, thử đọc/restore riêng trước kết luận |

Demo bước 5 phải gửi Telegram/Discord theo PDF trang 6 dù Bài 10 cho phép email. Token/receiver cấu hình trong secret; không đặt trong rule/Git/evidence. Kiểm tra cả thông báo FIRING và RESOLVED qua kênh thật.

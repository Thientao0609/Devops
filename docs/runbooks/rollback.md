# Rollback – chưa hoàn thành runtime

Không có release đã triển khai/Kubernetes nên chưa có bằng chứng rollback. Không hướng dẫn dùng `git reset` hoặc migration downgrade để giả lập tiêu chí này.

Runbook đích: xác định release tốt trước (digest từng image + config revision), ghi timestamp bản lỗi/phát hiện/bắt đầu rollback/recovery; kiểm tra schema tương thích, phục hồi app/config, đợi readiness và chạy smoke booking/email. Đo từ phát hiện đến smoke phục hồi ≤120 giây cho demo; báo thêm từ lúc phát sinh lỗi đến phục hồi. `kubectl rollout undo` một Deployment không tự phục hồi toàn bộ config hoặc DB. Cần diễn tập request loop và lưu p95/tổng lỗi.

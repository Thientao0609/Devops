# Khôi phục CSDL – chưa hoàn thành runtime

Sản phẩm này bắt buộc theo PDF trang 6; script restore/drill là nâng cao hữu ích. Chưa có lịch backup thực, backup artifact hoặc restore diễn tập; mục SUB3c chưa đạt.

Quy trình cần hoàn thiện ở Mốc 3: backup pg_dump có timestamp/checksum/exit code/retention, lưu ngoài vòng đời DB/pod; xác minh bản nguồn và checksum, tạo DB phục hồi riêng, pg_restore có ON_ERROR_STOP/exit-on-error phù hợp định dạng; kiểm tra migrations/row counts/unique constraints và smoke. Chỉ đổi kết nối sau khi kiểm tra và xác nhận phạm vi. Không restore đè hoặc xóa DB mặc định. Mật khẩu qua secret/.pgpass bảo vệ quyền, không tham số/log. Cần lưu output restore thật và RPO/RTO đo được.

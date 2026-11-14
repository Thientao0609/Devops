# Ngân sách tài nguyên trước khi chọn VM [THIẾT KẾ, CHƯA ĐO]

Khảo sát host Windows khoảng 16,87 GB RAM, còn khoảng 77 GB ổ D tại thời điểm đầu; không có bằng chứng đủ capacity toàn bộ stack. Phải tính cả Windows/WSL/Docker, 3 VM, EFK/monitoring, DB/broker và số replica HPA/KEDA tối đa. Không coi HPA max=5 hoạt động nếu scheduler không cấp được requests.

Phương án dự trù để thảo luận: Jenkins VM 3 GiB; k3s server 4 GiB; agent 6 GiB; Windows/host dự phòng 6 GiB → khoảng 19 GiB, vượt host hiện tại. Đây là ước lượng thiết kế chưa đo, không phải thông số đề bài. Có thể phân bổ 3 VM trên máy thành viên/host khác; chưa chọn provider cho đến khi xác nhận nền tảng thực. Không giảm monitoring/EFK khỏi yêu cầu để tuyên bố đủ tài nguyên.

Trước Mốc 3: đo baseline/peak từng service và EFK; bảng requests/limits/overhead theo node; lượng disk/PVC/backup/retention; đường mạng SSH/k3s, webhook vào Jenkins, registry Internet; kiểm tra virtualization/quyền tạo VM. Ưu tiên bắt buộc, không thêm tracing/service mesh trước khi đủ capacity.

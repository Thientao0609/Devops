# Phương án chuyển dữ liệu Docker sang ổ D

Trạng thái: **đã được người dùng duyệt; backup đã kiểm hash; chưa xác minh chuyển ổ thành công**. Người dùng đã duyệt tạm dừng Docker ngày14/11/2026 và đang thực hiện đổi location trong Docker Desktop. Việc này làm gián đoạn cả clinic-dev và my-jenkins.

[Backup thực tế](../evidence/docker-storage-20261114T073814Z/backup-manifest.json) khớp SHA256 cả data disk, bootstrap disk và settings khi Desktop đã dừng. [Bản sao D và thử cấu hình](../evidence/docker-migration-20261114T074728Z/copy-and-settings.json) chỉ là COPIED_AND_CONFIGURED_NOT_VERIFIED. Kiểm tra live sau khi engine phục hồi cho thấy data disk C bị giữ mở, bản D mở độc quyền được: **Docker vẫn dùng C**. Trường WslDataFolder thêm thủ công chưa có hiệu lực; không dùng nó làm cách chuyển được hỗ trợ. Script thử này đã rút khỏi repo, không chạy lại.

Công cụ điều khiển cửa sổ lỗi khởi tạo; người dùng đã nhận hướng dẫn dùng Settings chọn **D:\DockerData\active** (Docker tự thêm thư mục con tùy phiên bản) rồi Apply, tránh bản sao cũ trong D:\DockerData\DockerDesktopWSL. Cần kiểm tra đường dẫn thực sau thao tác. Bản D cũ là snapshot, không dùng thay dữ liệu C đã chạy lại.

Automatic approval review đã từ chối đề xuất xóa data disk C trước khi chứng minh Docker đọc D vì rủi ro mất dữ liệu. Không có disk gốc nào bị xóa; không lách bước kiểm chứng. Giữ backup trên D. Việc dọn nguồn chỉ xét sau khi cơ chế chuyển của Desktop hoàn tất và dữ liệu được kiểm tra thực.

## Dữ liệu đo trên máy

| Mục | Giá trị |
|---|---|
| Ổ C trống | 0byte tại thời điểm phát hiện lỗi |
| Ổ D trống | 76.957.159.424byte, khoảng71,67GiB |
| Disk dữ liệu | `C:\Users\Acer\AppData\Local\Docker\wsl\disk\docker_data.vhdx` |
| Kích thước file disk | 10.972.299.264byte, khoảng10,22GiB |
| Disk bootstrap | `C:\Users\Acer\AppData\Local\Docker\wsl\main\ext4.vhdx`,100.663.296byte |
| Cấu hình Desktop | `C:\Users\Acer\AppData\Roaming\Docker\settings-store.json` |
| Đích đề xuất | **D:\DockerData**, ngoài repo |
| Backup đề xuất | **D:\DockerBackup\before-m2-20261114**, ngoài repo |

D còn đủ cho một bản backup khoảng10,32GiB, dữ liệu chạy khoảng10,32GiB và phần dư cho build CI. Dung lượng sau chuyển cần đo lại; không cam kết kích thước data disk không tăng khi build. Docker có thể giữ bootstrap/cài đặt chương trình trên C; mục tiêu là chuyển data disk chứa image/container/volume.

## Các bước thực hiện sau khi được duyệt

1. Ghi snapshot container/volume/network, trạng thái ứng dụng và Jenkins khi daemon còn đọc được. Hiện scanner gặp lỗi I/O và Jenkins không truy cập được; ghi đúng lỗi, không coi inventory thiếu là dữ liệu đã mất.
2. Dừng Docker Desktop theo CLI/app chính thức, chờ engine và distro docker-desktop dừng, xác nhận VHDX không còn bị giữ mở. Không tắt/xóa các distro Ubuntu khác.
3. Copy data disk, bootstrap disk và settings vào thư mục backup mới trên D. Không ghi đè backup đã có. Tính SHA256 khi source đã ngừng ghi; so byte count/hash source với backup. Nếu copy/hash lỗi thì dừng chuyển.
4. Nếu C cần chỗ để Docker ghi settings, bảo toàn log Docker cũ vào backup trên D khi Desktop đã dừng, chỉ xử lý đúng thư mục log Docker được kiểm tra; không dọn Downloads, cache ứng dụng khác hoặc dữ liệu người dùng.
5. Mở Docker Desktop, vào **Settings → Resources → Advanced → Disk image location**, chọn **D:\DockerData\active**, Apply. Dùng cơ chế chuyển dữ liệu do Docker hỗ trợ; không tự sửa registry WSL, không unregister distro, không reset/factory reset.
6. Xác nhận Desktop sử dụng đường dẫn mới; VHDX trên D có dữ liệu, daemon đọc được volume cũ. Chạy lại clinic-dev từ image hiện có, xác nhận migration/seed exit0 và7service healthy. Kiểm tra API/publisher/worker health/ready/metrics, website, Mailpit và Jenkins cũ.
7. Kiểm tra một luồng đặt/hủy lịch synthetic và email; không suy container healthy thành cổng host hoạt động. Nếu image scanner bị ghi dở, chỉ tải lại đúng image/cache do Mốc2 tạo, không prune toàn hệ thống.
8. Lưu bằng chứng đường dẫn/dung lượng, hash backup, trạng thái trước/sau và các lỗi. **Giữ backup** sau khi kiểm chứng; việc xóa backup là quyết định riêng sau này.

## Quay lại nếu chuyển không thành công

- Dừng Desktop trước mọi thao tác với VHDX. Giữ cả nguồn/backup, không ghi đè file đang mount.
- Dùng vị trí cũ qua Settings khi còn khả dụng, hoặc phục hồi đúng settings/data disk từ backup đã kiểm hash theo quy trình hỗ trợ của Docker. Kiểm tra đủ dung lượng C trước khi phục hồi; không copy mù vào ổ đầy.
- Nếu Desktop không cho đổi location trong trạng thái lỗi hiện tại, dừng ở backup đã kiểm chứng và báo blocker để chọn cách di chuyển được hỗ trợ; không thử unregister/factory reset hoặc di chuyển distro khác.

Giới hạn: chuyển vị trí không sửa mọi lỗi ext4/containerd đã phát sinh do ghi dở. Backup/copy đã có bằng chứng, chuyển active disk và kiểm tra stack mới còn chờ. Cần ghi rõ Docker dùng D, volume cũ còn đủ và luồng nghiệp vụ chạy thật trước khi công bố hoàn tất.

Nguồn chính thức: [Docker Desktop WSL2 – nơi lưu dữ liệu và đổi location](https://docs.docker.com/desktop/features/wsl/), [Desktop settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/). Phiên bản máy: Desktop4.99.0, engine29.9.3.


Khôi phục15/11/2026: Docker engine đã chạy lại nhưng probe thực vẫn thấy VHD C bị giữ mở, bản D cũ mở độc quyền được, D:\DockerData\active chưa tồn tại. Có bản sao mới tại `D:\CODE\OOPs\Do_An\.ci-local\recovery-backups\before-recovery-20261115T005310\disk\docker_data.vhdx` và manifest trong evidence CI recovery, SHA256/bytes đã đối chiếu khi source giữ read-only độc quyền. Bản sao cũ không bị ghi đè; không coi recovery này là chuyển ổ thành công.

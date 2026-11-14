# Khôi phục WSL/Docker và kiểm chứng Jenkins – 15/11/2026

Trạng thái mới nằm trong [ci-runtime-latest.json](evidence/ci-runtime-latest.json). Đây là tiến độ kiểm chứng bổ sung, không chuyển toàn bộ Mốc 2–4 sang VERIFIED.

| Hạng mục | Kết quả thực tế | Giới hạn |
|---|---|---|
| WSL Ubuntu22.04 | Chạy được shell; Ansible syntax, Bash và Vault synthetic qua lại trong phiên này | Không phải Ansible trên VM hoặc changed=0 |
| Docker Desktop/engine | Khởi động lại thành công, Server29.9.3; controller/engine riêng healthy | Đĩa dữ liệu vẫn trên C, chưa xác nhận chuyển D |
| Jenkins dự án | http://localhost:18090 hoạt động; useSecurity=true, anonymous API trả403 | Không cấp credential cho Jenkins cũ8080 |
| Cấu hình Jenkins | Folder an-uyen, credential clinic-github, agent clinic-ci-linux và job clinic-pipeline đã tạo; Git client Jenkins đọc đúng SHA nhánh codex/milestone-4 | Credential GHCR chưa có |
| Jenkinsfile | Parser thật từng fail vì timestamps() cần plugin chưa cài; bỏ tùy chọn đó rồi parser qua | Chưa có build pipeline, plugin set không thay đổi; timestamp vẫn có trong evidence/artifact |
| Build agent | Node được đăng ký, numExecutors=1, offline=true | Image agent chưa tồn tại; chờ đĩa D trước build lớn |
| VM/cluster | Preflight tiếp tục BLOCKED | Thiếu quyền KVM, libvirt/QEMU, RAM và disk cho3VM; không cấp quyền hoặc tạo VM trong phiên này |

Docker trước khôi phục báo `preparing block device /dev/sde ... no such device or address`. Sau khi dừng Desktop, sao lưu dữ liệu, terminate **riêng docker-desktop** và khởi động Desktop lại, engine đã chạy. Không reset Docker, không unregister distro hay xóa volume; Ubuntu không bị shutdown toàn bộ. Chưa đủ bằng chứng kết luận file ext4 hỏng hoặc một nguyên nhân gốc khác; chỉ xác nhận triệu chứng và cách khôi phục đã chạy.

Bản sao mới nằm trên ổ D trong `.ci-local/recovery-backups`, ngoài Git và Docker context. Cả data VHDX13.645.119.488byte và bootstrap VHDX100.663.296byte được giữ mở chỉ đọc độc quyền khi copy, kiểm lại byte count/SHA256 của bản sao. D:\DockerBackup từ chối ghi thêm nên dùng thư mục private trong workspace; giữ backup cũ và nguồn C. Đây là snapshot **trước** khi cấu hình credential/job Jenkins mới, không khẳng định nó chứa các thay đổi sau snapshot.

Việc chuyển ổ còn cần thao tác Settings → Resources → Advanced → Disk image location → D:\DockerData\active → Apply. Công cụ điều khiển cửa sổ bị lỗi nên đã yêu cầu người dùng thực hiện thao tác này; chưa nhận xác nhận. Không build agent/images lớn khi C còn ít chỗ. Sau chuyển cần kiểm VHD trênD thật sự đang dùng, các volume cũ còn đủ và Jenkins/luồng ứng dụng hoạt động trước khi nghiệm thu.

Kiểm thử mã mới:81passed/8integration skipped; kiểm thử riêng driver scanner10passed có JUnit. Các bài integration cần dịch vụ riêng chưa chạy trong phiên này. Sửa scanner M4 dùng chung helper bảo mật: cache/temp trênD, ignorefile rỗng, ignore-unfixed=false; lỗi registry/scanner giữ gate đóng và tiếp tục các image độc lập. Kết quả scan thực được lưu riêng khi hoàn tất, không suy từ unit test.

Bước tiếp: xác nhận Docker đã chuyểnD → build/kết nối agent → chạy CI, demo âm và kiểm tra integration → GHCR SHA/digest khi có credential. Webhook thật, VM/cluster, promotion/approval, monitoring ingest/cảnh báo, scale/tải/rollback/video vẫn chưa nghiệm thu.

Đối chiếu thực tế: cả8plugin trực tiếp đúng version/active, controller numExecutors=0; engine uid1000/rootless và SecurityOptions có rootless/seccomp/cgroupns. Đây là kiểm chứng controller/engine, không thay image-agent/CI build.


Quét image giám sát đã hoàn tất: **8/8 digest, không có CRITICAL**, dùng Trivy0.76.2, cache/temp trênD, không ignore-unfixed và ignorefile rỗng. Lượt đầu Elasticsearch hết thời gian trong khi tải JavaDB953MiB, không có report nên gate đóng; lượt retry với cache và TRIVY_TIMEOUT=15m đã qua cả8. Có [bằng chứng scan](evidence/ops-security-latest.json); gate consumer đối chiếu report gốc/hash/digest/freshness đã qua. Đây là quét từ xa, không phải8image đã chạy hoặc stack giám sát được nghiệm thu.

Bản audit công bố chỉ che trường checksum SHA1 package mà Gitleaks nhầm thành Sourcegraph token; CVE/target và mọi kết quả được giữ nguyên, không thêm allowlist. Report gốc trong ci-out/observability-images vẫn giữ hash đúng cho bootstrap; bản audit đã che không dùng làm gate input. Lượt timeout và metadata gate thất bại trước đó được giữ lại.

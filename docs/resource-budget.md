# Ngân sách tài nguyên – thiết kế, chưa đo workload

Host khảo sát Windows11Home RAM16,87GB; WSL khoảng8GiB, D khoảng49GiB ở đầuM3. KVM có nhưng user chưa có quyền, libvirt/QEMU chưa cài. Preflight thực tại evidenceM3, không coi các giá trị dưới là benchmark.

Profile duy nhất trong infra/lab-budget.json được Terraform/preflight cùng đọc:

| VM | RAM | vCPU | Diskảo | Trách nhiệm |
|---|---|---|---|---|
| Jenkins | 6GiB |2|32GiB|Controller/agent/rootlessengine, compose.ci.vm hardlimit5GiB+OSreserve|
| k3sserver |4GiB|2|48GiB|Controlplane/workloads và backup ngoàiDBnode|
| k3sagent |8GiB|4|48GiB|StoragePVC+workloads|

VMtổng18GiB/8vCPU/128GiBdisk. Dự trù host32GiB RAM,160GiBdisktrống (VMcapacity+base/cache/backupreserve), cần đo lại; không phải requirementphầncứng PDF. Máy hiện tại chưa đủ. Sparseqcow2 không chứng minh đủ capacity khi data/cache tăng. DB labPVC2GiB/namespace; Rabbit2GiB/namespace; backupretention7ngày phải đo kíchthước và freecapacity server, xuất offVM trước teardown.

Ứng dụng2 namespace theo requests hiện tại: khoảng2,75GiB ở API2/worker1; khoảng4,5GiB ở API5/worker5. Dự phòng Mốc 4 khoảng3GiB requests cho EFK/Prometheus/Grafana/Alertmanager/exporters, cộng K3sOS/operator và rolloutsurge. Đây là dự trù, chưa chọn/bật đầy đủM4. Limits có overcommit, không hứa tất cảpod đạt limit đồng thời; requestsfit không chứng minh HPA/KEDAmax hoạt động. Phải đo memory/CPU/allocatable/pending/OOM và điều chỉnh trước nghiệm thu, không bỏ EFK/monitoring khỏi ngân sách để báo đủ.

1server+1agent và DB/broker1replica khôngHA. Demo xóaAPIpod không tương đương chịu lỗi controlplane/node/storage. Chưa có load/p95/scale hoặc peakM4 để công bố.

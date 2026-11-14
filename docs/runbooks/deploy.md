# Deploy – chưa hoàn thành runtime

Dev có hướng dẫn Compose trong README/local-setup. Trước khi bắt đầu: xác nhận đúng project, engine healthy, .env local không thiếu, ports đủ, `docker compose config --quiet`. Chạy up/build/wait, xem migrate/seed exit 0 và health tất cả; smoke booking → email → cancellation. Chỉ công bố thành công sau khi lưu log, digest và smoke thực.

Staging/production Kubernetes: BLOCKED, chưa có cluster/registry/credential. Runbook sẽ phải có release manifest image digest + config revision, secret preflight, migration Job một lần tương thích ngược, rollout/readiness, business smoke, approval Jenkins có timeout và promotion đúng digest. Không có lệnh deploy production được kiểm chứng ở phiên này. Namespace/data/vhost/secret phải tách môi trường; bootstrap quyền cluster tách deployer namespace.

FROM docker:29.9.3-dind-rootless AS validation
RUN docker --version > /tmp/docker-version && test -s /tmp/docker-version
FROM docker:29.9.3-dind-rootless
COPY --from=validation /tmp/docker-version /usr/local/share/clinic-docker-version
USER root
RUN mkdir -p /home/jenkins/agent && chown 1000:1000 /home/jenkins/agent
USER rootless
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=15 CMD docker -H unix:///run/user/1000/docker.sock info >/dev/null || exit 1

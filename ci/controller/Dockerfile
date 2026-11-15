FROM jenkins/jenkins:2.580.1-jdk21 AS configuration
COPY ci/controller/plugins.txt /tmp/plugins.txt
RUN jenkins-plugin-cli --latest=false --plugin-file /tmp/plugins.txt

FROM jenkins/jenkins:2.580.1-jdk21
COPY --from=configuration --chown=jenkins:jenkins /usr/share/jenkins/ref/plugins/ /usr/share/jenkins/ref/plugins/
COPY --chown=jenkins:jenkins ci/controller/security.groovy /usr/share/jenkins/ref/init.groovy.d/01-clinic-security.groovy
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Xms128m -Xmx768m"
USER jenkins
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=20 CMD curl -fsS http://127.0.0.1:8080/login >/dev/null || exit 1

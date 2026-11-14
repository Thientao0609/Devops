import jenkins.model.Jenkins
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.GlobalMatrixAuthorizationStrategy
import hudson.model.Item
import jenkins.model.JenkinsLocationConfiguration

def instance = Jenkins.get()
if (!instance.getSecurityRealm().getClass().equals(HudsonPrivateSecurityRealm.class)) {
    def password = System.getenv('CLINIC_JENKINS_ADMIN_PASSWORD')
    if (!password || password.length() < 24) {
        throw new IllegalStateException('Set a random CLINIC_JENKINS_ADMIN_PASSWORD with at least24characters')
    }
    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount('clinic-admin', password)
    instance.setSecurityRealm(realm)
}
// Dedicated controller only: the relay can read and queue builds, never administer.
def strategy = new GlobalMatrixAuthorizationStrategy()
strategy.add(Jenkins.ADMINISTER, 'clinic-admin')
strategy.add(Jenkins.READ, 'clinic-webhook')
strategy.add(Item.READ, 'clinic-webhook')
strategy.add(Item.BUILD, 'clinic-webhook')
instance.setAuthorizationStrategy(strategy)
instance.setNumExecutors(0)
instance.setSlaveAgentPort(-1)
JenkinsLocationConfiguration.get().setUrl(System.getenv('CLINIC_JENKINS_URL') ?: 'http://localhost:18090/')
instance.save()

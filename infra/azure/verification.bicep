@description('Azure Container Apps environment name.')
@allowed([
  'aca-lpr-test'
])
param environmentName string = 'aca-lpr-test'

@description('Container Apps app name.')
@allowed([
  'lpr-verification-test'
])
param containerAppName string = 'lpr-verification-test'

@description('Azure region for the isolated test deployment.')
@allowed([
  'swedencentral'
])
param location string = 'swedencentral'

@description('GHCR image digest built by the deployment workflow.')
param image string

@description('GitHub Container Registry username.')
param ghcrUser string

@secure()
@description('Read-only GHCR package token.')
param ghcrPullToken string

@secure()
@minLength(32)
@description('Dedicated, test-only lap signing secret. Never use a production secret.')
param verificationSecret string

@secure()
@minLength(32)
@description('Dedicated token protecting the read-only metrics endpoint.')
param metricsToken string

@description('Maximum simultaneous sessions admitted by this single replica.')
@minValue(1)
@maxValue(100)
param maxVerifiedSessions int = 2

@description('Maximum session starts admitted per minute. Bounded by Sessions to 256.')
@minValue(1)
@maxValue(256)
param maxVerifiedStartsPerMinute int = 100

@description('HTTPS origin of the separate Azure-hosted test game.')
param testGameOrigin string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    // The provider requires an absent/null destination to disable saved logs.
    appLogsConfiguration: null
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        {
          name: 'verification-secret'
          value: verificationSecret
        }
        {
          name: 'metrics-token'
          value: metricsToken
        }
        {
          name: 'ghcr-pull-token'
          value: ghcrPullToken
        }
      ]
      registries: [
        {
          server: 'ghcr.io'
          username: ghcrUser
          passwordSecretRef: 'ghcr-pull-token'
        }
      ]
      ingress: {
        external: true
        targetPort: 8081
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'verification'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'VERIFICATION_ENVIRONMENT'
              value: 'azure-test'
            }
            {
              name: 'VERIFICATION_PUBLIC'
              value: '1'
            }
            {
              name: 'PORT'
              value: '8081'
            }
            {
              name: 'MAX_VERIFIED_SESSIONS'
              value: string(maxVerifiedSessions)
            }
            {
              name: 'MAX_VERIFIED_STARTS_PER_MINUTE'
              value: string(maxVerifiedStartsPerMinute)
            }
            {
              name: 'GAME_ORIGINS'
              value: testGameOrigin
            }
            {
              name: 'VERIFICATION_METRICS_TOKEN'
              secretRef: 'metrics-token'
            }
            {
              name: 'VERIFICATION_SECRET'
              secretRef: 'verification-secret'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 8081
                scheme: 'HTTP'
              }
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8081
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8081
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output appName string = app.name
output appFqdn string = app.properties.configuration.ingress.fqdn

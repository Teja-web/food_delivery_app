/**
 * CI/CD pipeline template renderers.
 *
 * Pure templating — no DB, no auth, no Next-specific imports. Ported from
 * SDLC's `apps/mcp-server/src/tools/generate-pipeline.ts`. Each function
 * returns a complete pipeline config string for the named platform.
 *
 * Supported tech stacks: `node` (default), `python`, `java`, `go`, `dotnet`.
 * Supported platforms: `github_actions`, `azure_devops`, `gitlab_ci`, `jenkins`.
 */

export const PIPELINE_PLATFORMS = ["github_actions", "azure_devops", "gitlab_ci", "jenkins"] as const;
export type PipelinePlatform = (typeof PIPELINE_PLATFORMS)[number];

export const PIPELINE_STACKS = ["node", "python", "java", "go", "dotnet"] as const;
export type PipelineStack = (typeof PIPELINE_STACKS)[number];

export const PIPELINE_FILENAMES: Record<PipelinePlatform, string> = {
  github_actions: ".github/workflows/ci-cd.yml",
  azure_devops: "azure-pipelines.yml",
  gitlab_ci: ".gitlab-ci.yml",
  jenkins: "Jenkinsfile",
};

interface StackCommands {
  runtime: string;
  image: string;
  install: string;
  lint: string;
  build: string;
  test: string;
}

function getStackCommands(stack: PipelineStack): StackCommands {
  switch (stack) {
    case "python":
      return {
        runtime: "actions/setup-python@v5\n        with:\n          python-version: '3.12'\n          cache: 'pip'",
        image: "python:3.12",
        install: "pip install -r requirements.txt",
        lint: "ruff check . || pylint src/",
        build: "python -m build",
        test: "pytest --cov=src --cov-report=xml --junitxml=junit.xml",
      };
    case "java":
      return {
        runtime: "actions/setup-java@v4\n        with:\n          java-version: '17'\n          distribution: 'temurin'\n          cache: 'maven'",
        image: "maven:3.9-eclipse-temurin-17",
        install: "mvn dependency:resolve",
        lint: "mvn checkstyle:check",
        build: "mvn package -DskipTests",
        test: "mvn test",
      };
    case "go":
      return {
        runtime: "actions/setup-go@v5\n        with:\n          go-version: '1.22'",
        image: "golang:1.22",
        install: "go mod download",
        lint: "golangci-lint run",
        build: "go build ./...",
        test: "go test -race -coverprofile=coverage.out ./...",
      };
    case "dotnet":
      return {
        runtime: "actions/setup-dotnet@v4\n        with:\n          dotnet-version: '8.0.x'",
        image: "mcr.microsoft.com/dotnet/sdk:8.0",
        install: "dotnet restore",
        lint: "dotnet format --verify-no-changes",
        build: "dotnet build --no-restore",
        test: 'dotnet test --no-build --collect:"XPlat Code Coverage"',
      };
    default:
      return {
        runtime: "actions/setup-node@v4\n        with:\n          node-version: '20'\n          cache: 'npm'",
        image: "node:20",
        install: "npm ci",
        lint: "npm run lint",
        build: "npm run build",
        test: "npm test -- --coverage",
      };
  }
}

function getAuditCommand(stack: PipelineStack): string {
  switch (stack) {
    case "python":
      return "pip-audit";
    case "java":
      return "mvn dependency-check:check";
    case "go":
      return "govulncheck ./...";
    case "dotnet":
      return "dotnet list package --vulnerable --include-transitive";
    default:
      return "npm audit --audit-level=high";
  }
}

function generateGitHubActions(stack: PipelineStack): string {
  const { runtime, install, lint, build, test } = getStackCommands(stack);
  return `name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${runtime ? `      - uses: ${runtime}\n` : ""}      - name: Install dependencies
        run: ${install}
      - name: Lint
        run: ${lint}

  build:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
${runtime ? `      - uses: ${runtime}\n` : ""}      - name: Install dependencies
        run: ${install}
      - name: Build
        run: ${build}
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 3

  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
${runtime ? `      - uses: ${runtime}\n` : ""}      - name: Install dependencies
        run: ${install}
      - name: Run tests
        run: ${test}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: coverage/

  security-scan:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - name: Dependency audit
        run: ${getAuditCommand(stack)}
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

  deploy-staging:
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: dist/
      - name: Deploy to Staging
        run: |
          echo "Deploying to staging environment..."
          # TODO: Add your staging deployment commands
      - name: Smoke Tests
        run: |
          echo "Running smoke tests against staging..."
          # TODO: Add smoke test commands

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: dist/
      - name: Deploy to Production
        run: |
          echo "Deploying to production environment..."
          # TODO: Add your production deployment commands
      - name: Health Check
        run: |
          echo "Running post-deploy health checks..."
          # TODO: Add health check commands
      - name: Tag Release
        run: |
          git tag -a "v\${{ github.run_number }}" -m "Release v\${{ github.run_number }}"
          git push origin "v\${{ github.run_number }}"
`;
}

function generateAzureDevOps(stack: PipelineStack): string {
  const { install, lint, build, test } = getStackCommands(stack);
  const nodeTask =
    stack === "node"
      ? `          - task: UseNode@1
            inputs:
              version: '20.x'
`
      : "";

  return `trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

stages:
  - stage: Lint
    displayName: 'Lint & Code Quality'
    jobs:
      - job: Lint
        steps:
${nodeTask}          - script: ${install}
            displayName: 'Install dependencies'
          - script: ${lint}
            displayName: 'Run linter'

  - stage: Build
    displayName: 'Build'
    dependsOn: Lint
    jobs:
      - job: Build
        steps:
${nodeTask}          - script: ${install}
            displayName: 'Install dependencies'
          - script: ${build}
            displayName: 'Build application'
          - publish: $(System.DefaultWorkingDirectory)/dist
            artifact: build-output

  - stage: Test
    displayName: 'Test'
    dependsOn: Build
    jobs:
      - job: Test
        steps:
${nodeTask}          - script: ${install}
            displayName: 'Install dependencies'
          - script: ${test}
            displayName: 'Run tests'
          - task: PublishTestResults@2
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '**/junit.xml'
          - task: PublishCodeCoverageResults@2
            inputs:
              summaryFileLocation: coverage/cobertura-coverage.xml

  - stage: SecurityScan
    displayName: 'Security Scan'
    dependsOn: Build
    jobs:
      - job: Scan
        steps:
          - script: ${getAuditCommand(stack)}
            displayName: 'Dependency audit'

  - stage: DeployStaging
    displayName: 'Deploy to Staging'
    dependsOn: [Test, SecurityScan]
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployStaging
        environment: 'staging'
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: build-output
                - script: echo "Deploying to staging..."
                  displayName: 'Deploy to staging'
                - script: echo "Running smoke tests..."
                  displayName: 'Smoke tests'

  - stage: DeployProduction
    displayName: 'Deploy to Production'
    dependsOn: DeployStaging
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployProduction
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: build-output
                - script: echo "Deploying to production..."
                  displayName: 'Deploy to production'
                - script: echo "Running health checks..."
                  displayName: 'Post-deploy health check'
`;
}

function generateGitLabCI(stack: PipelineStack): string {
  const { image, install, lint, build, test } = getStackCommands(stack);
  return `stages:
  - lint
  - build
  - test
  - security
  - deploy-staging
  - deploy-production

default:
  image: ${image}

cache:
  key: \$CI_COMMIT_REF_SLUG
  paths:
    - node_modules/
    - .cache/

lint:
  stage: lint
  script:
    - ${install}
    - ${lint}

build:
  stage: build
  script:
    - ${install}
    - ${build}
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour

test:
  stage: test
  script:
    - ${install}
    - ${test}
  coverage: '/All files.*\\\\|.*\\\\s([\\\\d.]+)/'
  artifacts:
    reports:
      junit: junit.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

security-scan:
  stage: security
  script:
    - ${getAuditCommand(stack)}
  allow_failure: false

deploy-staging:
  stage: deploy-staging
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - echo "Deploying to staging..."
    # TODO: Add deployment commands
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

deploy-production:
  stage: deploy-production
  environment:
    name: production
    url: https://app.example.com
  script:
    - echo "Deploying to production..."
    # TODO: Add deployment commands
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
`;
}

function generateJenkinsfile(stack: PipelineStack): string {
  const { install, lint, build, test } = getStackCommands(stack);
  const toolsBlock =
    stack === "node"
      ? "    tools {\n        nodejs 'NodeJS-20'\n    }\n"
      : stack === "java"
        ? "    tools {\n        maven 'Maven-3'\n        jdk 'JDK-17'\n    }\n"
        : "";

  return `pipeline {
    agent any

${toolsBlock}    environment {
        CI = 'true'
    }

    stages {
        stage('Lint') {
            steps {
                sh '${install}'
                sh '${lint}'
            }
        }

        stage('Build') {
            steps {
                sh '${build}'
                archiveArtifacts artifacts: 'dist/**', fingerprint: true
            }
        }

        stage('Test') {
            steps {
                sh '${test}'
            }
            post {
                always {
                    junit '**/junit.xml'
                }
            }
        }

        stage('Security Scan') {
            steps {
                sh '${getAuditCommand(stack)}'
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to staging...'
                // TODO: Add staging deployment steps
            }
            post {
                success {
                    echo 'Running smoke tests...'
                    // TODO: Add smoke test steps
                }
            }
        }

        stage('Approval') {
            when {
                branch 'main'
            }
            steps {
                input message: 'Deploy to production?', submitter: 'release-approvers'
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to production...'
                // TODO: Add production deployment steps
            }
            post {
                success {
                    echo 'Running health checks...'
                    // TODO: Add health check steps
                }
                failure {
                    echo 'Deployment failed - initiating rollback'
                    // TODO: Add rollback steps
                }
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed - notifying team'
            // TODO: Add notification (Slack, email, etc.)
        }
    }
}
`;
}

function getDockerAddon(platform: PipelinePlatform): string {
  if (platform === "github_actions") {
    return `
  # ─── Docker Build & Push ─────────────────────────────────
  build-image:
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
`;
  }
  return "\n# Docker addon: Add docker build/push steps for your platform\n";
}

function getKubernetesAddon(platform: PipelinePlatform): string {
  if (platform === "github_actions") {
    return `
  # ─── Kubernetes Deploy ───────────────────────────────────
  # Add after deploy-staging or deploy-production:
  #   - uses: azure/k8s-set-context@v3
  #     with:
  #       kubeconfig: \${{ secrets.KUBE_CONFIG }}
  #   - uses: azure/k8s-deploy@v4
  #     with:
  #       manifests: k8s/
  #       images: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
`;
  }
  return "\n# Kubernetes addon: Add kubectl/helm deploy steps for your platform\n";
}

export function renderPipeline(args: {
  platform: PipelinePlatform;
  stack: PipelineStack;
  includeDocker?: boolean;
  includeKubernetes?: boolean;
}): { filename: string; content: string } {
  const filename = PIPELINE_FILENAMES[args.platform];

  let content: string;
  switch (args.platform) {
    case "github_actions":
      content = generateGitHubActions(args.stack);
      break;
    case "azure_devops":
      content = generateAzureDevOps(args.stack);
      break;
    case "gitlab_ci":
      content = generateGitLabCI(args.stack);
      break;
    case "jenkins":
      content = generateJenkinsfile(args.stack);
      break;
  }

  if (args.includeDocker) content += getDockerAddon(args.platform);
  if (args.includeKubernetes) content += getKubernetesAddon(args.platform);

  return { filename, content };
}

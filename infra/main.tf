terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" {
  type    = string
  default = "devkraken-514023"
}
variable "region" {
  type    = string
  default = "us-central1"
}
variable "github_repository" {
  type        = string
  description = "Exact owner/repo, e.g. DiegoDkSanchez/dev-kraken-portal"
}
variable "github_repository_id" {
  type        = string
  description = "Immutable numeric GitHub repository ID; prevents name reuse from granting access"
}
variable "database_tier" {
  type    = string
  default = "db-f1-micro"
}
resource "google_project_service" "apis" {
  for_each           = toset(["run.googleapis.com", "sqladmin.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "cloudresourcemanager.googleapis.com"])
  service            = each.key
  disable_on_destroy = false
}
resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "dev-kraken"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}
resource "google_sql_database_instance" "postgres" {
  name                = "dev-kraken-postgres"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = true
  settings {
    tier              = var.database_tier
    edition           = "ENTERPRISE"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    availability_type = "ZONAL"
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "08:00"
      transaction_log_retention_days = 7
    }
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_sql_database" "portal" {
  name     = "kraken"
  instance = google_sql_database_instance.postgres.name
}
resource "random_password" "database" {
  length  = 40
  special = false
}
resource "google_sql_user" "portal" {
  name     = "kraken"
  instance = google_sql_database_instance.postgres.name
  password = random_password.database.result
}
resource "google_secret_manager_secret" "database" {
  secret_id = "kraken-db-password"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret_version" "database" {
  secret      = google_secret_manager_secret.database.id
  secret_data = random_password.database.result
}
resource "google_secret_manager_secret" "smtp" {
  secret_id = "kraken-smtp-password"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
resource "google_service_account" "runtime" {
  account_id   = "kraken-runtime"
  display_name = "DEV KRAKEN API runtime"
  depends_on   = [google_project_service.apis]
}
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_secret_manager_secret_iam_member" "db_reader" {
  secret_id = google_secret_manager_secret.database.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_secret_manager_secret_iam_member" "smtp_reader" {
  secret_id = google_secret_manager_secret.smtp.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_service_account" "deployer" {
  account_id   = "kraken-github-deployer"
  display_name = "DEV KRAKEN GitHub deployment"
  depends_on   = [google_project_service.apis]
}
resource "google_project_iam_member" "deploy_roles" {
  for_each = toset(["roles/run.admin", "roles/artifactregistry.writer"])
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.deployer.email}"
}
resource "google_service_account_iam_member" "act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "kraken-github"
  display_name              = "DEV KRAKEN GitHub"
  depends_on                = [google_project_service.apis]
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "github_identity" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "deployer_service_account" { value = google_service_account.deployer.email }
output "runtime_service_account" { value = google_service_account.runtime.email }
output "cloud_sql_connection" { value = google_sql_database_instance.postgres.connection_name }
output "artifact_repository" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}" }

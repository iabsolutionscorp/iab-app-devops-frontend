import { Injectable } from '@angular/core';

/** Normaliza o HCL para apontar apenas os serviços usados para o LocalStack,
 * no exato estilo do exemplo de S3 fornecido (sem backend local implícito).
 */
@Injectable({ providedIn: 'root' })
export class LocalstackNormalizerService {
  private endpoint = 'http://localhost:4566';
  private region = 'us-east-1';

  /** Descobre os serviços AWS envolvidos a partir dos tipos de recursos/data. */
  private detectServices(hcl: string): Set<string> {
    const services = new Set<string>();
    const typeRegex = /(resource|data)\s+\"aws_([a-z0-9_]+)\"\s+\"[^"]+\"\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = typeRegex.exec(hcl)) !== null) {
      const awsType = m[2]; // e.g. s3_bucket, dynamodb_table, ec2_transit_gateway, iam_role, ecs_service, glue_job, vpc, subnet...
      const key = this.mapAwsTypeToEndpointKey(awsType);
      if (key) services.add(key);
    }
    return services;
  }

  /** Mapeia um tipo aws_* para a chave de endpoint do provider */
  private mapAwsTypeToEndpointKey(awsType: string): string | null {
    // Normalizações por família
    if (awsType.startsWith('s3')) return 's3';
    if (awsType.startsWith('dynamodb')) return 'dynamodb';
    if (awsType.startsWith('lambda')) return 'lambda';
    if (awsType.startsWith('sqs')) return 'sqs';
    if (awsType.startsWith('sns')) return 'sns';
    if (awsType.startsWith('secretsmanager')) return 'secretsmanager';
    if (awsType.startsWith('ssm')) return 'ssm';
    if (awsType.startsWith('iam')) return 'iam';
    if (awsType.startsWith('ecs')) return 'ecs';
    if (awsType.startsWith('ecr')) return 'ecr';
    // Tudo que é rede/compute do ec2 (vpc, subnet, route_table, security_group, instance...)
    if (awsType.startsWith('ec2') || awsType.startsWith('vpc') || awsType.includes('subnet') || awsType.includes('security_group') || awsType.startsWith('instance')) {
      return 'ec2';
    }
    if (awsType.startsWith('glue')) return 'glue';
    if (awsType.startsWith('cloudwatch_log') || awsType.startsWith('logs_')) return 'cloudwatchlogs';
    if (awsType.startsWith('apigateway')) return 'apigateway';
    if (awsType.startsWith('kinesis')) return 'kinesis';
    if (awsType.startsWith('kms')) return 'kms';
    if (awsType.startsWith('route53')) return 'route53';
    if (awsType.startsWith('rds')) return 'rds';
    if (awsType.startsWith('redshift')) return 'redshift';
    if (awsType.startsWith('ses')) return 'ses';
    if (awsType.startsWith('stepfunctions') || awsType.startsWith('sfn')) return 'stepfunctions';
    if (awsType.startsWith('sts')) return 'sts';
    // Default: desconhecido -> não cria endpoint dedicado
    return null;
  }

  ensure(hcl: string): string {
    if (!hcl) return hcl;

    // Remove providers aws existentes para reescrever no formato padrão desejado
    const cleaned = hcl.replace(/\bprovider\s+\"aws\"\s*\{[\s\S]*?\}/g, '').trim();

    // Descobrir serviços usados
    const services = this.detectServices(cleaned);

    // Montar a seção endpoints apenas com os serviços detectados
    let endpointsBlock = '';
    if (services.size > 0) {
      const lines = Array.from(services).sort().map(svc => `    ${svc} = "${this.endpoint}"`).join('\n');
      endpointsBlock = `\n  endpoints {\n${lines}\n  }`;
    }

    // Provider no estilo exato do exemplo do usuário
    const provider = `provider "aws" {
  access_key                  = "test"
  secret_key                  = "test"
  region                      = "${this.region}"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true${endpointsBlock}
}`;

    // Terraform { required_providers } – só adiciona se não existir ainda (sem backend local)
    let header = '';
    if (!/\bterraform\s*\{[\s\S]*?required_providers[\s\S]*?\}/.test(cleaned)) {
      header += `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}\n\n`;
    }

    return (header + provider + "\n\n" + cleaned + "\n").replace(/\n{3,}/g, "\n\n");
  }
}
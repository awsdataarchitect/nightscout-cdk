import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface NightscoutMigrationStackProps extends cdk.StackProps {
  /**
   * The ID of the Amazon Machine Image (AMI) to use for the EC2 instance
   * @default 'ami-08fc6fb8ad2e794bb'
   */
  readonly ami?: string;
  /**
   * The instance type for the EC2 instance
   * @default 't4g.small'
   */
  readonly instanceType?: string;
  /**
   * The API secret for Nightscout container
   */
  readonly apiSecret: string;
  /**
   * List of Nightscout features to enable
   * @default 'careportal basal iob cob bridge'
   */
  readonly enable?: string;
  /**
   * The username for the Nightscout bridge
   */
  readonly bridgeUsername: string;
  /**
   * The password for the Nightscout bridge
   */
  readonly bridgePassword: string;
  /**
   * The server for the Nightscout bridge
   * @default 'EU'
   */
  readonly bridgeServer?: string;
  /**
   * The connection string for MongoDb
   */
  readonly mongoConnection: string;
  /**
   * The key pair for the EC2 instance
   */
  readonly keyPair: string;
}

export class NightscoutMigrationStack extends cdk.Stack {
  /**
   * Public IP address of the Nightscout instance
   */
  public readonly nightscoutInstanceIp;

  public constructor(scope: cdk.App, id: string, props: NightscoutMigrationStackProps) {
    super(scope, id, props);

    // Applying default props
    props = {
      ...props,
      ami: props.ami ?? 'ami-08fc6fb8ad2e794bb',
      instanceType: props.instanceType ?? 't4g.small',
      enable: props.enable ?? 'careportal basal iob cob bridge',
      bridgeServer: props.bridgeServer ?? 'EU',
    };

    // Resources
    const myElasticIp = new ec2.CfnEIP(this, 'MyElasticIP', {
    });

    const nightscoutInstance = new ec2.CfnInstance(this, 'NightscoutInstance', {
      imageId: props.ami!,
      instanceType: props.instanceType!,
      keyName: props.keyPair!,
      userData: cdk.Fn.base64(`#!/bin/bash

      cat << 'EOF' > /home/ec2-user/docker-compose.yml
      version: '3'
      services:
        nightscout:
          image: nightscout/cgm-remote-monitor:latest
          container_name: nightscout
          environment:
            - API_SECRET=${props.apiSecret!}
            - INSECURE_USE_HTTP=true
            - NODE_ENV=production
            - TZ=Etc/UTC
            - ENABLE=${props.enable!}
            - BRIDGE_USER_NAME=${props.bridgeUsername!}
            - BRIDGE_PASSWORD=${props.bridgePassword!}
            - MONGO_CONNECTION=${props.mongoConnection!}
            - BRIDGE_SERVER=${props.bridgeServer!}
            - AUTH_DEFAULT_ROLES=denied
            - DISPLAY_UNITS=mmol/L
          labels:
            - "traefik.enable=true"
            - "traefik.http.routers.nightscout.rule=Host(\`${myElasticIp.attrPublicIp}\`)"
            - 'traefik.http.routers.nightscout.entrypoints=websecure'          
            - 'traefik.http.routers.nightscout.tls.certresolver=le'  
        traefik:
          image: traefik:latest
          container_name: traefik
          volumes:
            - './letsencrypt:/letsencrypt'
            - /var/run/docker.sock:/var/run/docker.sock:ro
          command:
            - '--providers.docker=true'
            - '--providers.docker.exposedbydefault=false'
            - '--entrypoints.web.address=:80'
            - '--entrypoints.web.http.redirections.entrypoint.to=websecure'
            - '--entrypoints.websecure.address=:443'
            - "--certificatesresolvers.le.acme.httpchallenge=true"
            - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
            - '--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json'
            - '--certificatesresolvers.le.acme.email=youremail@gmail.com'  
          ports:
            - "80:80"
            - "443:443"
      EOF
      sudo yum update -y
      sudo yum install docker -y
      #sudo usermod -a -G docker ec2-user
      #sudo chkconfig docker on
      sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
      sudo chmod +x /usr/local/bin/docker-compose
      systemctl enable docker
      systemctl start docker

      docker-compose -f /home/ec2-user/docker-compose.yml up -d
      `),
    });
    nightscoutInstance.addDependency(myElasticIp);

    const elasticIpAssociation = new ec2.CfnEIPAssociation(this, 'ElasticIpAssociation', {
      instanceId: nightscoutInstance.ref,
      allocationId: myElasticIp.attrAllocationId,
    });

    // Outputs
    this.nightscoutInstanceIp = nightscoutInstance.attrPublicIp;
    new cdk.CfnOutput(this, 'CfnOutputNightscoutInstanceIP', {
      key: 'NightscoutInstanceIP',
      description: 'Public IP address of the Nightscout instance',
      value: this.nightscoutInstanceIp!.toString(),
    });
  }
}

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NightscoutMigrationStack } from '../lib/nightscout_migration-stack';

const app = new cdk.App();
new NightscoutMigrationStack(app, 'NightscoutMigration', {
  apiSecret: "",
  keyPair: "mykeypair",
  bridgeUsername: "",
  bridgePassword: "",
  mongoConnection: ""
});

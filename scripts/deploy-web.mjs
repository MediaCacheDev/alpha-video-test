#!/usr/bin/env node
// Puts the web demo on S3 behind CloudFront: creates or updates the stack in web/hosting.yml, builds,
// uploads what changed and invalidates CloudFront. Uses the AWS CLI's session (aws sso login or
// aws configure) and its region.
//
//   npm run deploy:web
//
// STACK names the stack (default alpha-video-test-web). WEB_MEDIA_SKIP lists media to leave out,
// comma-separated (default the 839 MB Raw Manta); the app greys them out.
//
// WEB_DOMAIN (e.g. alpha-video.dev) serves the site there and at www., with DNS in the domain's
// Route 53 hosted zone. A certificate is requested and validated the first time. Later deploys keep
// the domain without it; WEB_DOMAIN= (empty) removes it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const stack = process.env.STACK ?? 'alpha-video-test-web';
const skip = process.env.WEB_MEDIA_SKIP ?? 'manta_uncompressed.ktx2';
const domain = process.env.WEB_DOMAIN;

// Media names don't change with their contents, so browsers keep them a day; each deploy
// invalidates CloudFront. Bundles are content-hashed; index.html and the worker are checked each load.
const MEDIA_TYPES = { '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.apng': 'image/apng', '.avif': 'image/avif' };
const MEDIA_CACHE = 'public, max-age=86400';
const HASHED_CACHE = 'public, max-age=31536000, immutable';
const ENTRY_FILES = { 'index.html': 'text/html; charset=utf-8', 'range-source-sw.js': 'text/javascript; charset=utf-8' };

function aws(...args) {
  return execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

/** Like aws(), with the CLI's output shown as it runs */
function awsLoud(...args) {
  execFileSync('aws', args, { stdio: 'inherit' });
}

async function md5(file) {
  const hash = createHash('md5');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** The md5 an earlier deploy stored on the object, or null when it isn't there */
function remoteMd5(bucket, key) {
  try {
    return execFileSync('aws', ['s3api', 'head-object', '--bucket', bucket, '--key', key, '--query', 'Metadata.md5', '--output', 'text'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Uploads the media whose contents changed, and deletes what's no longer shipped */
async function uploadMedia(bucket) {
  const files = await readdir(path.join(dist, 'media'));
  for (const name of files) {
    const type = MEDIA_TYPES[path.extname(name)];
    if (!type) throw new Error(`No content type for media/${name}`);
    const file = path.join(dist, 'media', name);
    const hash = await md5(file);
    if (remoteMd5(bucket, `media/${name}`) === hash) continue;
    console.log(`media/${name}`);
    awsLoud('s3', 'cp', file, `s3://${bucket}/media/${name}`, '--only-show-errors',
      '--content-type', type, '--cache-control', MEDIA_CACHE, '--metadata', `md5=${hash}`);
  }
  const remote = aws('s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', 'media/', '--query', 'Contents[].Key', '--output', 'text');
  for (const key of remote.split(/\s+/).filter(k => k && k !== 'None')) {
    if (!files.includes(key.slice('media/'.length))) awsLoud('s3', 'rm', `s3://${bucket}/${key}`);
  }
}

/** The id of the domain's Route 53 hosted zone */
function hostedZone(name) {
  const id = aws('route53', 'list-hosted-zones-by-name', '--dns-name', name,
    '--query', `HostedZones[?Name=='${name}.'].Id | [0]`, '--output', 'text');
  if (id === 'None') {
    throw new Error(`No Route 53 hosted zone for ${name}. Create one with \`aws route53 create-hosted-zone `
      + `--name ${name} --caller-reference ${name}\` and set its name servers at the registrar.`);
  }
  return id.replace('/hostedzone/', '');
}

/** The certificate for the domain and www., in us-east-1 as CloudFront needs; requested and validated if there isn't one */
async function certificate(name, zone) {
  const acm = (...args) => aws('acm', ...args, '--region', 'us-east-1');
  let arn = acm('list-certificates', '--certificate-statuses', 'ISSUED', 'PENDING_VALIDATION',
    '--query', `CertificateSummaryList[?DomainName=='${name}'].CertificateArn | [0]`, '--output', 'text');
  if (arn === 'None') {
    console.log(`Requesting a certificate for ${name} and www.${name}`);
    arn = acm('request-certificate', '--domain-name', name, '--subject-alternative-names', `www.${name}`,
      '--validation-method', 'DNS', '--query', 'CertificateArn', '--output', 'text');
  }
  if (acm('describe-certificate', '--certificate-arn', arn, '--query', 'Certificate.Status', '--output', 'text') === 'ISSUED') {
    return arn;
  }

  // ACM adds the validation records a few seconds after the request
  let records;
  for (;;) {
    const options = JSON.parse(acm('describe-certificate', '--certificate-arn', arn,
      '--query', 'Certificate.DomainValidationOptions', '--output', 'json'));
    if (options.every(o => o.ResourceRecord)) {
      records = [...new Map(options.map(o => [o.ResourceRecord.Name, o.ResourceRecord])).values()];
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  const changes = records.map(r => ({
    Action: 'UPSERT',
    ResourceRecordSet: { Name: r.Name, Type: r.Type, TTL: 300, ResourceRecords: [{ Value: r.Value }] },
  }));
  aws('route53', 'change-resource-record-sets', '--hosted-zone-id', zone, '--change-batch', JSON.stringify({ Changes: changes }));
  // Not `aws acm wait`, which gives up after a few minutes; a registrar's name server change can take hours
  console.log('Waiting for the certificate, which needs the domain\'s name servers to be Route 53\'s');
  for (let minutes = 0; minutes < 120; minutes++) {
    const status = acm('describe-certificate', '--certificate-arn', arn, '--query', 'Certificate.Status', '--output', 'text');
    if (status === 'ISSUED') return arn;
    if (status !== 'PENDING_VALIDATION') throw new Error(`Certificate ${arn} is ${status}`);
    if (minutes % 10 === 0) console.log(`  still ${status} after ${minutes} min`);
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
  throw new Error(`Certificate ${arn} isn't issued after 2 hours; run the deploy again once it is`);
}

let parameters = [];
if (domain) {
  const zone = hostedZone(domain);
  parameters = [`DomainName=${domain}`, `CertificateArn=${await certificate(domain, zone)}`, `HostedZoneId=${zone}`];
} else if (domain === '') {
  parameters = ['DomainName=', 'CertificateArn=', 'HostedZoneId='];
}

console.log(`Stack ${stack}`);
awsLoud('cloudformation', 'deploy', '--stack-name', stack, '--template-file', path.join(root, 'web/hosting.yml'),
  '--no-fail-on-empty-changeset', ...(parameters.length ? ['--parameter-overrides', ...parameters] : []));
const output = key => aws('cloudformation', 'describe-stacks', '--stack-name', stack,
  '--query', `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`, '--output', 'text');
const bucket = output('BucketName');
const distribution = output('DistributionId');

// webpack's clean keeps chunks it didn't rewrite, so a fresh dist/ holds only this build
await rm(dist, { recursive: true, force: true });
execFileSync('npm', ['run', 'build:web'], { cwd: root, stdio: 'inherit', env: { ...process.env, WEB_MEDIA_SKIP: skip } });

await uploadMedia(bucket);
const syncArgs = ['s3', 'sync', dist, `s3://${bucket}`, '--only-show-errors', '--exclude', 'media/*',
  ...Object.keys(ENTRY_FILES).flatMap(f => ['--exclude', f])];
awsLoud(...syncArgs, '--cache-control', HASHED_CACHE);
// After the bundles it loads, and before old bundles are deleted
for (const [name, type] of Object.entries(ENTRY_FILES)) {
  awsLoud('s3', 'cp', path.join(dist, name), `s3://${bucket}/${name}`, '--only-show-errors',
    '--content-type', type, '--cache-control', 'no-cache');
}
awsLoud(...syncArgs, '--delete');
aws('cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*');

console.log(`\n${output('Url')}`);

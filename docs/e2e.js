'use strict';
const e2e = require('./e2ekit'); const { build } = require('../src/app');
const clock = () => new Date('2026-11-24T10:00:00Z');
e2e((o) => build({ ...o, clock }), async ({ page, shot, ok, restart, login, modal, tick, url }) => {
  await login(); await page.waitFor('document.body.innerText.includes("Upcoming interviews")'); await tick(300); await shot('01-overview'); ok(true, 'overview with funnel and upcoming interviews');
  await page.click('a[data-id=pipeline]'); await page.waitFor('document.querySelectorAll(".cc").length===12'); ok(true, 'kanban shows all 12 open candidates in stage columns'); await shot('02-pipeline');
  await page.clickText('.cc', 'Rahul Verma'); await page.waitFor('document.body.innerText.includes("Scorecards")');
  await page.waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Move to offer"))'); await page.clickText('button', 'Move to offer'); await page.waitFor('document.querySelector(".toast.bad")'); ok((await page.text()).includes('at least 2'), 'offer is blocked until two scorecards exist');
  await page.clickText('button', 'Add scorecard'); await page.waitFor('document.querySelector(".modal")'); await modal('interviewer', 'Tess Liu'); await modal('skills', 5); await page.click('#modal-submit');
  await page.waitFor('document.body.innerText.includes("Tess Liu")'); ok(true, 'second scorecard saved (weighted 4.5 shown)'); 
  await tick(500); await page.waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Move to offer"))'); await page.clickText('button', 'Move to offer'); await page.waitFor('document.body.innerText.includes("offer")&&document.querySelector(".badge.info").textContent==="offer"'); ok(true, 'candidate moves to offer after two scorecards'); await shot('03-candidate');
  await restart(); await page.eval('location.reload()'); await page.waitFor('document.querySelector(".badge.info")&&document.querySelector(".badge.info").textContent==="offer"'); ok(true, 'stage and scorecards persist after restart');
  await page.clickText('button', 'Reject'); await page.waitFor('document.querySelector(".modal")'); await modal('reason', 'Accepted another offer'); await page.click('#modal-submit');
  await page.waitFor('document.body.innerText.includes("Rejected: Accepted another offer")'); ok(true, 'rejection reason recorded'); await page.clickText('button', 'Reopen'); await page.waitFor('document.querySelector(".badge.info").textContent==="applied"'); ok(true, 'rejected candidate can be reopened');
  await page.viewport(390, 844, true); await page.eval('location.hash="#/pipeline"'); await page.waitFor('document.querySelectorAll(".cc").length===12'); await tick(300); await shot('04-mobile-pipeline');
}, { docs: __dirname });

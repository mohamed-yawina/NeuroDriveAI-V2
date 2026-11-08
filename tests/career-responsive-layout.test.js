import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const careerCss = readFileSync(new URL('../src/game/career-panel.css', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

describe('Career menu responsive layout contracts', () => {
  it('activates a career-only composition from the existing view navigation', () => {
    expect(mainJs).toContain("menu.classList.toggle('menu-career-active', button.dataset.view === 'career')");
    expect(careerCss).toContain('.main-menu.menu-career-active .showroom-stage');
    expect(careerCss).toContain('.main-menu.menu-career-active [data-panel=career]');
  });

  it('allocates desktop space to both panel and showroom without fixed-width clipping', () => {
    expect(careerCss).toMatch(/\.main-menu\.menu-career-active \.showroom-stage\{left:42%;width:58%/);
    expect(careerCss).toMatch(/\.main-menu\.menu-career-active \[data-panel=career\]\{[^}]*width:min\(39%,760px\)[^}]*overflow-x:hidden[^}]*overflow-y:auto/s);
    expect(careerCss).toContain('top:98px;bottom:14px');
    expect(careerCss).toContain('container-type:inline-size');
  });

  it('provides readable statistics, calendar and narrow-screen layouts', () => {
    expect(careerCss).toContain('grid-template-columns:repeat(4,minmax(0,1fr))');
    expect(careerCss).toContain('@container (max-width:570px)');
    expect(careerCss).toContain('@media(max-width:1024px)');
    expect(careerCss).toContain('@media(max-width:640px)');
    expect(careerCss).toContain('font-size:clamp(28px,2.1vw,36px)');
    expect(careerCss).toContain('font-size:clamp(20px,1.5vw,28px)');
    expect(careerCss).toContain('career-round-track svg{height:66px}');
  });

  it('scopes the layout so the other menu views retain their shared styling', () => {
    const scopedRules = careerCss.match(/\.main-menu\.menu-career-active[^{}]*\{/g) ?? [];
    expect(scopedRules.length).toBeGreaterThan(10);
    expect(careerCss).not.toMatch(/\.main-menu\s+\.showroom-stage\s*\{/);
    expect(careerCss).not.toMatch(/\.main-menu\s+\[data-panel=career\]\s*\{/);
  });
});

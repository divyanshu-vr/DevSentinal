"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Custom Cursor
    const cursor = document.getElementById("cursor");
    let isRunning = true;
    let mouseX = window.innerWidth / 2,
      mouseY = window.innerHeight / 2;
    let cursorX = mouseX,
      cursorY = mouseY;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    document.addEventListener("mousemove", onMouseMove);

    const clickables = document.querySelectorAll(
      ".clickable, a, button, .video-container"
    );
    const onEnter = () => cursor?.classList.add("hover");
    const onLeave = () => cursor?.classList.remove("hover");

    clickables.forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });

    const drawCursor = () => {
      if (!isRunning || !cursor) return;
      cursorX += (mouseX - cursorX) * 0.2;
      cursorY += (mouseY - cursorY) * 0.2;
      cursor.style.left = `${cursorX}px`;
      cursor.style.top = `${cursorY}px`;
      requestAnimationFrame(drawCursor);
    };
    if (cursor) drawCursor();

    // Navbar Scroll
    const navbar = document.getElementById("navbar");
    const handleScroll = () => {
      if (navbar) {
        if (window.scrollY > 50) navbar.classList.add("scrolled");
        else navbar.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", handleScroll);

    // Scroll Reveal
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    // Hero Widget Loop
    const twText = document.getElementById("tw-text");
    const fullText = "@miniminion fix this: github.com/acehack/api/issues/88";
    const rows = document.querySelectorAll(".pipeline-row");
    const prCard = document.getElementById("pr-card");

    const stageData = [
      "[DONE — 12 files, 3.1k tokens]",
      "[DONE — spun up in 8.3s]",
      "[DONE — 1 LLM call]",
      "[DONE — 2.1s]",
      "[DONE — 14/14 passed]",
      "[DONE]",
      "[DONE]",
    ];

    let loopActive = true;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms);
        timeouts.push(id);
      });

    async function runLoop() {
      if (!loopActive || !twText || !prCard) return;

      // Reset
      twText.textContent = "";
      prCard.classList.remove("visible");
      rows.forEach((row) => {
        row.classList.remove("visible", "running", "done");
        const statusEl = row.querySelector(".row-status");
        if (statusEl) statusEl.textContent = "";
      });

      // Typewriter
      await sleep(500);
      for (let i = 0; i < fullText.length; i++) {
        if (!loopActive) return;
        twText.textContent += fullText[i];
        await sleep(30);
      }
      await sleep(1000);

      // Pipeline
      let i = 0;
      for (const row of Array.from(rows)) {
        if (!loopActive) return;
        row.classList.add("visible", "running");
        const statusEl = row.querySelector(".row-status");
        if (statusEl) statusEl.textContent = "RUNNING...";
        await sleep(500);
        row.classList.remove("running");
        row.classList.add("done");
        if (statusEl) statusEl.textContent = stageData[i];
        i++;
      }

      // PR Card
      await sleep(800);
      if (!loopActive) return;
      prCard.classList.add("visible");

      // Restart Loop
      await sleep(4000);
      if (loopActive) runLoop();
    }

    runLoop();

    // CLEANUP
    return () => {
      isRunning = false;
      loopActive = false;
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
      timeouts.forEach((t) => clearTimeout(t));
      clickables.forEach((el) => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  return (
    <>
      <div id="cursor"></div>

      <nav id="navbar">
        <a href="#" className="logo">
          <span>⚡</span> MiniMinions
        </a>
        <div className="nav-links">
          <a href="#architecture" className="nav-link clickable">
            Architecture
          </a>
          <a href="#demo" className="nav-link clickable">
            Demo
          </a>
          <a href="#" className="nav-link clickable">
            GitHub
          </a>
          <a href="#" className="btn btn-outline clickable">
            Get Started
          </a>
        </div>
      </nav>

      <header id="hero">
        <div className="bg-mesh"></div>
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-eyebrow">v1.0 · Inspired by Minions</div>
            <h1 className="hero-title">
              Fix GitHub issues.<br />
              While you <span className="glow-underline">sleep</span>.
            </h1>
            <p className="hero-subtitle">
              MiniMinions is an open-source PR agent that turns a Slack message
              into a merged-ready pull request — fully autonomous, sandboxed,
              and powered by Claude AI.
            </p>
            <div className="hero-ctas">
              <a href="#demo" className="btn btn-primary clickable">
                ⚡ See it in action
              </a>
              <a href="#" className="btn btn-secondary clickable">
                ★ Star on GitHub
              </a>
            </div>
            <div className="hero-social-proof">
              Inspired by how Stripe handles 1,000+ automated PRs/week
              internally
            </div>
          </div>

          <div className="hero-widget-frame">
            <div className="hero-widget terminal-card">
              <div className="widget-slack">
                <span className="slack-channel">#engineering-bot</span>
                <span className="slack-msg">
                  <span id="tw-text"></span>
                  <span className="cursor-blink"></span>
                </span>
              </div>

              <div className="widget-pipeline" id="pipeline-stages">
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 🔍 Orchestrator
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 📦 E2B Sandbox
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 🧠 Claude Agent
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 📋 Linter
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 🧪 Tests
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 🚀 PR Creation
                  </div>
                  <div className="row-status"></div>
                </div>
                <div className="pipeline-row">
                  <div className="row-left">
                    <div className="row-dot"></div> 💬 Slack Notified
                  </div>
                  <div className="row-status"></div>
                </div>
              </div>

              <div className="pr-card-popup" id="pr-card">
                <div className="pr-title">✓ PR #247 opened</div>
                <div className="pr-desc">
                  fix: handle null avatar in getUserProfile
                </div>
                <div className="pr-meta">
                  <span>2 files changed · 14 tests passing</span>
                  <span className="pr-link clickable">Ready for review &rarr;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="social-proof-bar reveal">
        <div className="marquee-content">
          <div className="stats-row">
            <span>⚡ &lt; 90s average PR time</span>
            <span className="stat-sep">&middot;</span>
            <span>🔒 Fully sandboxed execution</span>
            <span className="stat-sep">&middot;</span>
            <span>🧠 Max 2 LLM calls per run</span>
            <span className="stat-sep">&middot;</span>
            <span>🔓 100% open source</span>
            <span className="stat-sep">&middot;</span>
            <span>🛠 Powered by Claude Sonnet 4.5</span>
            <span className="stat-sep">&middot;</span>
          </div>
          <div className="stats-row" aria-hidden="true">
            <span>⚡ &lt; 90s average PR time</span>
            <span className="stat-sep">&middot;</span>
            <span>🔒 Fully sandboxed execution</span>
            <span className="stat-sep">&middot;</span>
            <span>🧠 Max 2 LLM calls per run</span>
            <span className="stat-sep">&middot;</span>
            <span>🔓 100% open source</span>
            <span className="stat-sep">&middot;</span>
            <span>🛠 Powered by Claude Sonnet 4.5</span>
            <span className="stat-sep">&middot;</span>
          </div>
        </div>
      </div>

      <section className="how-it-works" id="architecture">
        <div className="section-header reveal">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 className="section-title">Seven layers. Two LLM calls. One PR.</h2>
          <p className="section-subtitle">
            Most AI agents are just LLMs in a loop. MiniMinions wraps Claude in
            a deterministic pipeline — fast, predictable, and safe.
          </p>
        </div>

        <div className="pipeline-diagram">
          <div className="pipeline-line">
            <div className="flow-dot"></div>
            <div className="flow-dot flow-dot-2"></div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">01</div>
              <div className="step-header">
                <div className="step-title">🔍 Deterministic Orchestrator</div>
                <div className="badge blue">[DETERMINISTIC]</div>
              </div>
              <p className="step-desc">
                Fetches GitHub issue, discovers files, curates context bundle
                (&le;15 files, ~3k tokens)
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">02</div>
              <div className="step-header">
                <div className="step-title">📦 E2B Sandbox</div>
                <div className="badge blue">[DETERMINISTIC]</div>
              </div>
              <p className="step-desc">
                Isolated cloud VM spins up in ~10s. No internet. No prod access.
                Agent runs here.
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card highlight">
              <div className="ghost-num">03</div>
              <div className="step-header">
                <div className="step-title">🧠 Claude Agent Loop</div>
                <div className="badge purple">[LLM CALL #1]</div>
              </div>
              <p className="step-desc">
                claude-sonnet-4.5 receives curated context + 4 tools. Reads,
                writes, fixes. One call.
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">04</div>
              <div className="step-header">
                <div className="step-title">📋 Tier 1 — Linter</div>
                <div className="badge blue">[DETERMINISTIC]</div>
              </div>
              <p className="step-desc">
                eslint / ruff on changed files only. Auto-fix trivial issues.
                Under 5 seconds.
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">05</div>
              <div className="step-header">
                <div className="step-title">🧪 Tier 2 — Test Runner</div>
                <div className="badge yellow">[LLM CALL #2 if needed]</div>
              </div>
              <p className="step-desc">
                Relevant tests only. On failure: Claude gets the error and
                retries. Max 2 rounds.
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">06</div>
              <div className="step-header">
                <div className="step-title">🚀 GitHub PR</div>
                <div className="badge blue">[DETERMINISTIC]</div>
              </div>
              <p className="step-desc">
                git commit &rarr; push &rarr; Octokit opens PR with description,
                labels, and diff summary.
              </p>
            </div>
          </div>

          <div className="step-card-wrapper reveal">
            <div className="step-card">
              <div className="ghost-num">07</div>
              <div className="step-header">
                <div className="step-title">💬 Slack Notification</div>
                <div className="badge blue">[DETERMINISTIC]</div>
              </div>
              <p className="step-desc">
                PR link posted back to the exact Slack thread that triggered the
                run.
              </p>
            </div>
          </div>
        </div>

        <div className="insight-box reveal">
          <div className="insight-content">
            <b>💡 Why deterministic-first?</b>
            <br />
            <br />
            LLM calls are slow and non-deterministic. Every step that can be
            done with regular code must be done with regular code. The LLM only
            activates when you need judgment — not for git push.
          </div>
        </div>
      </section>

      <section className="demo-section" id="demo">
        <div className="section-header reveal">
          <span className="eyebrow">DEMO</span>
          <h2 className="section-title">Watch it open a real PR</h2>
          <p className="section-subtitle">
            A real GitHub issue. A real repository. A real pull request. In 87
            seconds.
          </p>
        </div>

        <div className="video-container terminal-chrome reveal clickable">
          <div className="video-chrome">
            <div className="chrome-dots">
              <div className="chrome-dot dot-r"></div>
              <div className="chrome-dot dot-y"></div>
              <div className="chrome-dot dot-g"></div>
            </div>
            <div className="chrome-title">miniminions-demo.mp4</div>
          </div>
          <div className="video-player">
            <div className="video-grad"></div>
            <div className="play-btn">
              <span>&#9654;</span>
            </div>
            <div className="video-placeholder">Demo recording coming soon</div>
          </div>
        </div>

        <div className="demo-stats reveal">
          <div className="demo-stat-card">
            <div className="stat-val">87s</div>
            <div className="stat-lbl">Average time per run</div>
          </div>
          <div className="demo-stat-card">
            <div className="stat-val">2</div>
            <div className="stat-lbl">LLM calls per run</div>
          </div>
          <div className="demo-stat-card">
            <div className="stat-val">14/14</div>
            <div className="stat-lbl">Tests passing on first attempt</div>
          </div>
        </div>
      </section>

      <section className="tech-stack">
        <div className="section-header reveal">
          <span className="eyebrow">BUILT WITH</span>
          <h2 className="section-title">No magic. Just good engineering.</h2>
        </div>

        <div className="stack-grid">
          <div className="tech-card reveal">
            <div className="tech-icon">⚡</div>
            <div className="tech-info">
              <h4>Claude Sonnet 4.5</h4>
              <p>The agent brain</p>
            </div>
          </div>
          <div
            className="tech-card reveal"
            style={{ transitionDelay: "50ms" }}
          >
            <div className="tech-icon">🟦</div>
            <div className="tech-info">
              <h4>E2B Sandbox</h4>
              <p>Isolated cloud VM execution</p>
            </div>
          </div>
          <div
            className="tech-card reveal"
            style={{ transitionDelay: "100ms" }}
          >
            <div className="tech-icon">🐙</div>
            <div className="tech-info">
              <h4>GitHub API (Octokit)</h4>
              <p>PR creation + file fetch</p>
            </div>
          </div>
          <div
            className="tech-card reveal"
            style={{ transitionDelay: "150ms" }}
          >
            <div className="tech-icon">💬</div>
            <div className="tech-info">
              <h4>Slack Bolt</h4>
              <p>Command entry point</p>
            </div>
          </div>
          <div
            className="tech-card reveal"
            style={{ transitionDelay: "200ms" }}
          >
            <div className="tech-icon">🟢</div>
            <div className="tech-info">
              <h4>Node.js</h4>
              <p>Pipeline runtime</p>
            </div>
          </div>
          <div
            className="tech-card reveal"
            style={{ transitionDelay: "250ms" }}
          >
            <div className="tech-icon">⚛️</div>
            <div className="tech-info">
              <h4>Next.js</h4>
              <p>Web UI + API routes</p>
            </div>
          </div>
        </div>

        <div className="arch-flow reveal">
          Slack <span className="arch-arrow">&rarr;</span> Orchestrator{" "}
          <span className="arch-arrow">&rarr;</span> E2B Sandbox
          <span className="arch-arrow">&rarr;</span> Claude Agent{" "}
          <span className="arch-arrow">&rarr;</span> Tests{" "}
          <span className="arch-arrow">&rarr;</span> GitHub PR
        </div>
      </section>

      <footer>
        <div className="footer-content">
          <div className="footer-left">
            <div className="logo">
              <span>⚡</span> MiniMinions
            </div>
            <div className="footer-desc">Fire. Forget. Merge.</div>
            <div className="footer-sub">
              Built at AceHack 5.0 &middot; UEM Jaipur &middot; March 2026
            </div>
          </div>
          <div className="footer-links">
            <a href="#" className="clickable">
              GitHub
            </a>
            <a href="#" className="clickable">
              Documentation
            </a>
            <a href="#" className="clickable">
              Inspired by  Minions
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; 2026 MiniMinions &middot; Open Source &middot; MIT License
        </div>
      </footer>

      <style jsx global>{`
        h1, h2, h3, .syne { font-family: 'Syne', sans-serif; letter-spacing: -0.03em; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        a, button { cursor: none; }
        
        #cursor {
            position: fixed; top: 0; left: 0; width: 8px; height: 8px;
            background: var(--accent2); border-radius: 50%; pointer-events: none;
            z-index: 9999; transform: translate(-50%, -50%);
            transition: width 0.2s, height 0.2s, background 0.2s, border 0.2s;
            box-shadow: 0 0 10px rgba(167, 139, 250, 0.5);
        }
        #cursor.hover {
            width: 32px; height: 32px; background: rgba(124, 58, 237, 0.15);
            border: 1px solid var(--accent2); box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
        }

        .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .reveal.in-view { opacity: 1; transform: translateY(0); }

        nav {
            position: fixed; top: 0; left: 0; width: 100%; display: flex; justify-content: space-between;
            align-items: center; padding: 1rem 5%; backdrop-filter: blur(20px); background: rgba(8, 8, 16, 0.8);
            z-index: 1000; border-bottom: 1px solid var(--border); transition: box-shadow 0.3s ease;
        }
        nav.scrolled { box-shadow: 0 1px 0 var(--border); }
        .logo { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 1.25rem; color: var(--white); text-decoration: none; display: flex; align-items: center; gap: 0.5rem; }
        .logo span { color: var(--accent); }
        .nav-links { display: flex; gap: 2rem; align-items: center; }
        .nav-link { color: var(--muted); text-decoration: none; font-weight: 500; transition: color 0.2s; }
        .nav-link:hover { color: var(--white); }

        .btn { display: inline-block; padding: 0.6rem 1.2rem; border-radius: 8px; text-decoration: none; font-weight: 500; transition: all 0.2s ease; text-align: center; }
        .btn-outline { border: 1px solid var(--accent); color: var(--accent2); background: transparent; }
        .btn-outline:hover { background: rgba(124, 58, 237, 0.1); box-shadow: 0 0 15px rgba(124, 58, 237, 0.2); }
        .btn-primary { background: var(--accent); color: var(--white); border: 1px solid var(--accent); }
        .btn-primary:hover { box-shadow: 0 0 20px rgba(124, 58, 237, 0.4); transform: translateY(-1px); }
        .btn-secondary { background: transparent; color: var(--muted); border: 1px solid var(--border); }
        .btn-secondary:hover { color: var(--text); border-color: var(--muted); }

        header { position: relative; min-height: 100vh; display: flex; align-items: center; padding: 6rem 5% 0; overflow: hidden; }
        .bg-mesh { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background-color: var(--bg); background-image: radial-gradient(ellipse 800px 600px at 20% 50%, rgba(124, 58, 237, 0.06), transparent), radial-gradient(ellipse 600px 500px at 80% 30%, rgba(59, 130, 246, 0.04), transparent), radial-gradient(circle, rgba(255, 255, 255, 0.03) 1px, transparent 1px); background-size: 100% 100%, 100% 100%, 32px 32px; }
        .hero-container { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; width: 100%; max-width: 1280px; margin: 0 auto; align-items: center; }
        .hero-eyebrow { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); color: var(--accent2); padding: 0.4rem 0.8rem; border-radius: 999px; margin-bottom: 2rem; opacity: 0; animation: fadeUp 0.6s forwards 0.1s; }
        .hero-title { font-weight: 800; font-size: 72px; line-height: 1.05; margin-bottom: 1.5rem; opacity: 0; animation: fadeUp 0.6s forwards 0s; }
        .glow-underline { position: relative; display: inline-block; color: var(--white); }
        .glow-underline::after { content: ''; position: absolute; bottom: 4px; left: 0; width: 100%; height: 4px; background: var(--accent); border-radius: 2px; box-shadow: 0 0 15px var(--accent); animation: pulseGlow 2s infinite alternate; }
        
        @keyframes pulseGlow { from { opacity: 0.7; box-shadow: 0 0 10px var(--accent); } to { opacity: 1; box-shadow: 0 0 25px var(--accent), 0 0 10px var(--accent2); } }
        
        .hero-subtitle { font-family: 'DM Sans', sans-serif; font-size: 20px; color: var(--muted); max-width: 480px; line-height: 1.6; margin-bottom: 2.5rem; opacity: 0; animation: fadeUp 0.6s forwards 0.2s; }
        .hero-ctas { display: flex; gap: 1rem; margin-bottom: 1.5rem; opacity: 0; animation: fadeUp 0.6s forwards 0.3s; }
        .hero-social-proof { font-size: 14px; color: var(--muted); opacity: 0; animation: fadeUp 0.6s forwards 0.4s; }
        .hero-widget-frame { opacity: 0; animation: fadeUp 0.6s forwards 0.5s; position: relative; }
        
        .hero-widget, .terminal-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; box-shadow: 0 0 60px rgba(124, 58, 237, 0.08); position: relative; overflow: hidden; min-height: 400px; display: flex; flex-direction: column; animation: floatWidget 6s ease-in-out infinite; }
        @keyframes floatWidget { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        
        .terminal-chrome { background: var(--surface2); border: 1px solid var(--border2); }
        
        .widget-slack { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--muted); margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
        .widget-slack .slack-channel { color: var(--blue); margin-bottom: 0.5rem; display: block; }
        .widget-slack .slack-msg { color: var(--text); }
        .cursor-blink { display: inline-block; width: 8px; height: 15px; background: var(--text); vertical-align: middle; animation: blink 1s step-end infinite; margin-left: 2px; }
        
        @keyframes blink { 50% { opacity: 0; } }
        
        .widget-pipeline { flex: 1; display: flex; flex-direction: column; gap: 0.8rem; }
        .pipeline-row { display: flex; align-items: center; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 12px; opacity: 0; transform: translateX(-10px); transition: all 0.3s ease; }
        .pipeline-row.visible { opacity: 1; transform: translateX(0); }
        .row-left { display: flex; align-items: center; gap: 0.8rem; color: var(--text); }
        .row-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
        .pipeline-row.running .row-dot { background: #eab308; box-shadow: 0 0 10px #eab308; animation: dotPulse 1s infinite alternate; }
        .pipeline-row.done .row-dot { background: var(--green); box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
        .row-status { color: var(--muted); }
        .pipeline-row.done .row-status { color: var(--green); }
        
        @keyframes dotPulse { from { transform: scale(1); opacity: 0.8; } to { transform: scale(1.3); opacity: 1; } }
        
        .pr-card-popup { position: absolute; bottom: -100%; left: 1.5rem; right: 1.5rem; background: rgba(16, 185, 129, 0.05); border: 1px solid var(--green); border-radius: 12px; padding: 1.25rem; box-shadow: 0 0 30px rgba(16, 185, 129, 0.1); transition: bottom 0.5s cubic-bezier(0.16, 1, 0.3, 1); backdrop-filter: blur(10px); }
        .pr-card-popup.visible { bottom: 1.5rem; }
        .pr-title { color: var(--green); font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 14px; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem; }
        .pr-desc { font-size: 13px; color: var(--text); margin-bottom: 0.75rem; font-family: 'JetBrains Mono', monospace; }
        .pr-meta { font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
        .pr-link { color: var(--accent2); text-decoration: none; font-weight: 500; }
        
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        .social-proof-bar { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1.25rem 0; overflow: hidden; white-space: nowrap; position: relative; }
        .marquee-content { display: flex; width: max-content; animation: scrollLeft 35s linear infinite; }
        .stats-row { display: flex; justify-content: center; gap: 1.5rem; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: var(--text); min-width: max-content; padding-right: 1.5rem; }
        .stat-sep { color: var(--accent); font-weight: bold; }
        
        @keyframes scrollLeft { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        
        .how-it-works { padding: 8rem 5%; max-width: 1000px; margin: 0 auto; position: relative; }
        .section-header { text-align: center; margin-bottom: 5rem; }
        .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--accent); text-transform: uppercase; margin-bottom: 1rem; display: block; }
        .section-title { font-size: 48px; margin-bottom: 1.5rem; }
        .section-subtitle { color: var(--muted); max-width: 600px; margin: 0 auto; font-size: 18px; }
        
        .pipeline-diagram { position: relative; padding: 2rem 0; min-height: 100%; }
        .pipeline-line { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--border); transform: translateX(-50%); border-radius: 2px; }
        .flow-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--accent2); box-shadow: 0 0 15px var(--accent); left: 50%; transform: translateX(-50%); top: 0; animation: dropDown 3s linear infinite; opacity: 0; }
        .flow-dot-2 { animation-delay: 1.5s; }
        
        @keyframes dropDown { 0% { top: 0; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        
        .step-card-wrapper { display: flex; justify-content: flex-start; width: 100%; margin-bottom: -1rem; }
        .step-card-wrapper:nth-child(even) { justify-content: flex-end; }
        .step-card-wrapper:nth-child(even) .step-card { margin-right: 0; margin-left: 2rem; }
        .step-card-wrapper:nth-child(odd) .step-card { margin-left: 0; margin-right: 2rem; }
        
        .step-card { position: relative; width: calc(50% - 3rem); background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; transition: all 0.3s ease; z-index: 2; }
        .step-card:hover { border-color: rgba(124, 58, 237, 0.4); background: var(--surface2); transform: translateY(-2px); }
        .step-card.highlight { border-color: rgba(124, 58, 237, 0.4); box-shadow: 0 0 30px rgba(124, 58, 237, 0.1); }
        
        .ghost-num { position: absolute; top: -10px; left: -20px; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 64px; color: rgba(124, 58, 237, 0.15); pointer-events: none; line-height: 1; z-index: -1; }
        .step-card-wrapper:nth-child(even) .ghost-num { left: auto; right: -20px; }
        .step-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
        .step-title { font-weight: 700; font-size: 18px; color: var(--text); font-family: 'Syne', sans-serif; }
        .step-desc { font-size: 15px; color: var(--muted); }
        
        .badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 0.2rem 0.5rem; border-radius: 4px; letter-spacing: 0.5px; white-space: nowrap; }
        .badge.blue { background: rgba(59, 130, 246, 0.1); color: var(--blue); border: 1px solid rgba(59, 130, 246, 0.3); }
        .badge.purple { background: rgba(124, 58, 237, 0.1); color: var(--accent2); border: 1px solid rgba(124, 58, 237, 0.3); }
        .badge.yellow { background: rgba(234, 179, 8, 0.1); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); }
        
        .insight-box { background: rgba(124, 58, 237, 0.06); border: 1px solid rgba(124, 58, 237, 0.2); border-radius: 12px; padding: 1.5rem; margin-top: 5rem; }
        .insight-content { color: var(--text); font-size: 15px; }
        
        .demo-section { background: var(--bg); padding: 6rem 5%; border-top: 1px solid var(--border); }
        .video-container { max-width: 900px; margin: 0 auto 3rem; aspect-ratio: 16 / 9; background: var(--surface2); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 0 80px rgba(124, 58, 237, 0.1); display: flex; flex-direction: column; overflow: hidden; }
        .video-chrome { background: var(--surface); padding: 0.75rem 1rem; display: flex; align-items: center; border-bottom: 1px solid var(--border); }
        .chrome-dots { display: flex; gap: 6px; }
        .chrome-dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot-r { background: #ef4444; }
        .dot-y { background: #eab308; }
        .dot-g { background: #10b981; }
        .chrome-title { margin: 0 auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }
        .video-player { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; cursor: pointer; }
        .video-grad { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 200px; height: 200px; background: radial-gradient(circle, rgba(124, 58, 237, 0.2) 0%, transparent 70%); filter: blur(20px); z-index: 1; }
        
        .play-btn { width: 72px; height: 72px; border: 2px solid var(--accent); border-radius: 50%; display: flex; justify-content: center; align-items: center; color: var(--accent); font-size: 24px; z-index: 2; transition: all 0.3s ease; padding-left: 6px; }
        .play-btn:hover { background: rgba(124, 58, 237, 0.1); box-shadow: 0 0 20px rgba(124, 58, 237, 0.3); transform: scale(1.05); }
        .video-placeholder { margin-top: 1.5rem; color: var(--muted); z-index: 2; }
        
        .demo-stats { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
        .demo-stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; text-align: center; transition: transform 0.3s ease, border-color 0.3s ease; }
        .demo-stat-card:hover { transform: translateY(-4px); border-color: rgba(124, 58, 237, 0.4); }
        .stat-val { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 40px; color: var(--accent); line-height: 1.2; margin-bottom: 0.25rem; }
        .stat-lbl { font-size: 14px; color: var(--muted); }
        
        .tech-stack { padding: 8rem 5%; border-top: 1px solid var(--border); max-width: 1100px; margin: 0 auto; }
        .stack-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 3rem; }
        .tech-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; transition: all 0.3s; }
        .tech-card:hover { border-color: var(--accent); transform: translateY(-2px); }
        .tech-icon { font-size: 24px; }
        .tech-info h4 { font-family: 'Syne', sans-serif; font-weight: 700; color: var(--text); margin-bottom: 0.25rem; }
        .tech-info p { font-size: 13px; color: var(--muted); }
        
        .arch-flow { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--text); text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
        .arch-arrow { color: var(--accent); animation: slideRight 1.5s infinite; display: inline-block; }
        @keyframes slideRight { 0% { transform: translateX(0); opacity: 0.5; } 50% { transform: translateX(3px); opacity: 1; } 100% { transform: translateX(0); opacity: 0.5; } }
        
        footer { border-top: 1px solid var(--border); padding: 4rem 5% 2rem; background: var(--bg); }
        .footer-content { max-width: 1280px; margin: 0 auto; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3rem; }
        .footer-left .logo { margin-bottom: 0.5rem; font-size: 1.5rem; }
        .footer-desc { color: var(--text); font-family: 'Syne', sans-serif; font-weight: 700; margin-bottom: 0.25rem; }
        .footer-sub { color: var(--muted); font-size: 14px; }
        .footer-links { display: flex; gap: 2rem; }
        .footer-links a { color: var(--text); text-decoration: none; font-weight: 500; transition: color 0.2s; }
        .footer-links a:hover { color: var(--accent2); }
        .footer-bottom { text-align: center; padding-top: 2rem; border-top: 1px solid rgba(255, 255, 255, 0.05); color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }

        @media (max-width: 1024px) {
            .hero-title { font-size: 56px; }
            .step-card { width: calc(50% - 2rem); }
            .stack-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
            .hero-container { grid-template-columns: 1fr; gap: 3rem; }
            .hero-widget-frame { order: -1; }
            header { padding-top: 8rem; text-align: center; }
            .hero-subtitle { margin: 0 auto 2.5rem; }
            .hero-ctas { justify-content: center; }
            .hero-title { font-size: 48px; }
            .pipeline-line { left: 24px; transform: none; }
            .flow-dot { left: 24px; transform: translateX(-4px); }
            .step-card-wrapper { flex-direction: column; gap: 2rem; margin-bottom: 2rem; }
            .step-card-wrapper:nth-child(even), .step-card-wrapper:nth-child(odd) { justify-content: flex-start; }
            .step-card-wrapper:nth-child(even) .step-card, .step-card-wrapper:nth-child(odd) .step-card { width: calc(100% - 50px); margin-left: 50px; margin-right: 0; }
            .ghost-num { font-size: 48px; left: 0; top: -24px; }
            .step-card-wrapper:nth-child(even) .ghost-num { left: 0; right: auto; }
            .step-header { flex-direction: column; gap: 0.5rem; }
            .demo-stats { grid-template-columns: 1fr; }
            .stack-grid { grid-template-columns: 1fr; }
            .footer-content { flex-direction: column; gap: 2rem; text-align: center; align-items: center; }
            .nav-links { display: none; }
        }
      `}</style>
    </>
  );
}

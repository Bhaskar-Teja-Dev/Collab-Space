import { Link } from 'react-router-dom';
import { Users, Zap, Shield, Code2, FileText, Layers } from 'lucide-react';
import styles from './Landing.module.css';

const features = [
  {
    icon: <FileText size={22} />,
    title: 'Live Document Editing',
    desc: 'Google-Docs-style Operational Transform sync. Multiple users, one document, zero conflicts.',
  },
  {
    icon: <Layers size={22} />,
    title: 'Collaborative Whiteboard',
    desc: 'Draw, sketch, and ideate together on a shared infinite canvas in real time.',
  },
  {
    icon: <Code2 size={22} />,
    title: 'Code Pair-Programming',
    desc: 'Monaco Editor with shared cursors and language-aware syntax highlighting.',
  },
  {
    icon: <Users size={22} />,
    title: 'Live Presence',
    desc: 'See who\'s in the room with colored cursors and avatar badges — sub-100ms updates.',
  },
  {
    icon: <Zap size={22} />,
    title: 'Sub-200ms Sync',
    desc: 'Socket.IO WebSocket transport with Redis Pub/Sub for horizontal scaling.',
  },
  {
    icon: <Shield size={22} />,
    title: 'Private Rooms',
    desc: 'Create a shareable link for your team. Auth required, rooms are yours.',
  },
];

export default function Landing() {
  return (
    <div className={styles.page}>
      {/* Background orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>C</div>
            <span>CollabSpace</span>
          </div>
          <div className={styles.navActions}>
            <Link to="/auth" className="btn btn-ghost btn-sm">Sign In</Link>
            <Link to="/auth" className="btn btn-primary btn-sm" id="landing-cta-nav">Get Started Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`badge badge-accent ${styles.heroBadge} animate-fade-in`}>
          <Zap size={12} />
          Real-Time Collaboration Engine
        </div>

        <h1 className={`${styles.heroTitle} animate-fade-in-up`}>
          One workspace.<br />
          <span className="text-gradient">Infinite collaboration.</span>
        </h1>

        <p className={`${styles.heroSub} animate-fade-in-up`}>
          CollabSpace brings your team together with live document editing,
          whiteboards, and code pairing — all powered by a single real-time sync
          engine built on Operational Transform and WebSockets.
        </p>

        <div className={`${styles.heroActions} animate-fade-in-up`}>
          <Link to="/auth" className="btn btn-primary btn-xl" id="landing-cta-hero">
            Start Collaborating
          </Link>
          <a
            href="https://github.com/Bhaskar-Teja-Dev/Collab-Space"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-xl"
          >
            View on GitHub
          </a>
        </div>

        {/* Live indicator */}
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span>WebSocket connected · sub-200ms latency</span>
        </div>
      </section>

      {/* Feature grid */}
      <section className={styles.features}>
        <div className={styles.featuresInner}>
          <h2 className={styles.sectionTitle}>
            One engine. <span className="text-gradient">Four superpowers.</span>
          </h2>
          <p className={styles.sectionSub}>
            Every module — docs, whiteboards, notes, code — plugs into the same
            real-time sync engine. The hard part built once, reused everywhere.
          </p>

          <div className={styles.featureGrid}>
            {features.map((f) => (
              <div className={`card ${styles.featureCard}`} key={f.title}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack callout */}
      <section className={styles.tech}>
        <div className={styles.techInner}>
          <p className={styles.techLabel}>Built with</p>
          <div className={styles.techPills}>
            {['React', 'Node.js', 'Socket.IO', 'Redis Pub/Sub', 'PostgreSQL', 'Operational Transform'].map((t) => (
              <span key={t} className={`badge badge-accent ${styles.techPill}`}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.cta}>
        <div className={`card ${styles.ctaCard}`}>
          <h2>Ready to collaborate?</h2>
          <p>Create a free account and invite your team in seconds.</p>
          <Link to="/auth" className="btn btn-primary btn-lg" id="landing-cta-bottom">
            Get Started — It's Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>CollabSpace · Built with OT, WebSockets &amp; Redis Pub/Sub ·{' '}
          <a href="https://github.com/Bhaskar-Teja-Dev/Collab-Space" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

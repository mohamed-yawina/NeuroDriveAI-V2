export class SessionNavigation {
  constructor({ onStateChange = () => {} } = {}) {
    this.state = 'menu';
    this.session = null;
    this.onStateChange = onStateChange;
  }

  setState(state) {
    this.state = state;
    this.onStateChange(state);
  }

  async launch(createSession) {
    if (this.state !== 'menu') return null;
    this.setState('loading');
    try {
      this.session = await createSession();
      this.setState('simulation');
      return this.session;
    } catch (error) {
      this.session = null;
      this.setState('menu');
      throw error;
    }
  }

  async returnToMenu() {
    if (this.state !== 'simulation' || !this.session) return;
    this.setState('closing');
    const session = this.session;
    this.session = null;
    try {
      await session.dispose();
    } finally {
      this.setState('menu');
    }
  }
}

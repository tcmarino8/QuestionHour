class Question {
  constructor(text, theme = 'general') {
    this.text = text;
    this.theme = theme;
    this.current = false;
    this.timestamp = new Date().toISOString();
  }

  static create(text, theme) {
    return new Question(text, theme);
  }

  toJSON() {
    return {
      text: this.text,
      theme: this.theme,
      current: this.current,
      timestamp: this.timestamp
    };
  }
}

export default Question; 
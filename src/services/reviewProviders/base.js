/**
 * Abstract ReviewProvider base class.
 * Concrete providers extend this and implement every method.
 */
class ReviewProvider {
  get key() { throw new Error('ReviewProvider.key not implemented'); }
  async getAuthorizationUrl(context) { throw new Error(`${this.constructor.name}: getAuthorizationUrl not implemented`); }
  async exchangeAuthorizationCode(code, context) { throw new Error(`${this.constructor.name}: exchangeAuthorizationCode not implemented`); }
  async refreshAccessToken(connection) { throw new Error(`${this.constructor.name}: refreshAccessToken not implemented`); }
  async getValidToken(connection) { throw new Error(`${this.constructor.name}: getValidToken not implemented`); }
  async listAccounts(connection) { throw new Error(`${this.constructor.name}: listAccounts not implemented`); }
  async listLocations(connection, externalAccountId) { throw new Error(`${this.constructor.name}: listLocations not implemented`); }
  async syncReviews(connection, location) { throw new Error(`${this.constructor.name}: syncReviews not implemented`); }
  async replyToReview(connection, review, reply) { throw new Error(`${this.key} provider does not support review replies`); }
  async disconnect(connection) {}
}

module.exports = ReviewProvider;

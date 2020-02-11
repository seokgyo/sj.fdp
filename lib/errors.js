/* eslint-disable max-classes-per-file */

class PasswordError extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}

class UnknownError extends Error {
  constructor(msg, details) {
    super(msg);
    this.details = details;
  }
}

class InvalidPDFError extends Error {}

class MissingPDFError extends Error {}

class UnexpectedResponseError extends Error {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }
}

/**
 * Error caused during parsing PDF data.
 */
class FormatError extends Error {}

/**
 * Error used to indicate task cancellation.
 */
class AbortError extends Error {}

export {
  AbortError,
  FormatError,
  InvalidPDFError,
  MissingPDFError,
  PasswordError,
  UnexpectedResponseError,
  UnknownError,
};

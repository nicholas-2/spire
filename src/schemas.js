/*
  A list of schemas for DApp operations (used to validate operations).
*/

const idAlphabet = 'abcdefghijklmnopqrstuvwxyz-0123456789'

module.exports = {
  create: {
    type: 'object',
    id: {
      type: 'string',
      alphabet: idAlphabet
    },
    args: {
      type: 'object'
    },
    source: {
      type: 'string'
    }
  },

  transact: {
    type: 'object',
    id: {
      type: 'string',
      alphabet: idAlphabet
    },
    func: {
      type: 'string'
    },
    args: {
      type: 'object'
    }
  }
}

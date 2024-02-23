// https://on.cypress.io/api

describe('Sign in', () => {
  it('Sign in successful', () => {
    cy.visit('/')
    cy.contains('button', 'Sign in').click()
    cy.get('.el-dialog').should('be.visible')

    cy.get('.el-input__inner').eq(0).type('jdoe@test.com')
    cy.get('.el-input__inner').eq(1).type('123123123')
    cy.get('[data-testid="submit-btn"]').click()

    cy.get('.header-items .relative.flex').click()
  })
})

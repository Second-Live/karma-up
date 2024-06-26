Feature: Mocha reporter
  In order to use Karma
  As a person who wants to write great tests
  I want to be able to use the mocha reporter.

  Scenario: Execute a test in ChromeHeadless with colors
    Given a configuration with:
      """
      files = ['mocha/plus.js', 'mocha/test.js'];
      browsers = ['ChromeHeadlessNoSandbox'];
      frameworks = ['mocha', 'chai']
      plugins = [
        'karma-jasmine',
        'karma-chrome-launcher',
        'karma-chai'
      ];
      reporters = ['mocha'];
      """
    When I start Karma
    Then it passes with like:
      """
      2 tests completed
      """

  Scenario: Execute a test in ChromeHeadless with no-colors
    Given a configuration with:
      """
      files = ['mocha/plus.js', 'mocha/test.js'];
      browsers = ['ChromeHeadlessNoSandbox'];
      frameworks = ['mocha', 'chai']
      plugins = [
        'karma-jasmine',
        'karma-chrome-launcher',
        'karma-chai'
      ];
      reporters = ['mocha'];
      """
    When I start Karma with additional arguments: "--no-color"
    Then it passes with like:
      """
      ✔ 2 tests completed
      """

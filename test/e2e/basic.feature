Feature: Basic Testrunner
  In order to use Karma
  As a person who wants to write great tests
  I want to be able to run tests from the command line.

  Scenario: Execute a test in ChromeHeadless
    Given a configuration with:
      """
      files = ['basic/plus.js', 'basic/test.js'];
      browsers = ['ChromeHeadlessNoSandbox'];
      plugins = [
        'karma-jasmine',
        'karma-chrome-launcher'
      ];
      """
    When I start Karma
    Then it passes with:
      """
      ..
      Chrome Headless
      """

  Scenario: Execute a test in Firefox
    Given a configuration with:
      """
      files = ['basic/plus.js', 'basic/test.js']
      browsers = ['FirefoxHeadless']
      plugins = [
        'karma-jasmine',
        'karma-firefox-launcher'
      ]
      """
    When I start Karma
    Then it passes with:
      """
      ..
      Firefox
      """

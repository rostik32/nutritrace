## Purpose

Lets a person create their own NutriTrace account without an admin, when the server owner has turned on open sign-up,
and keeps that off by default.

## ADDED Requirements

### Requirement: Open sign-up is off by default
The server SHALL refuse anonymous account creation unless an admin has turned on the "Allow sign-up" switch.

#### Scenario: Fresh install after the first account
- **WHEN** an anonymous client posts a valid username and password to `POST /api/auth/register` and sign-up is off
- **THEN** the server responds 403 and creates no account

### Requirement: Admin controls the sign-up switch
Only an admin SHALL be able to read or change the "Allow sign-up" switch, from Settings → Users.

#### Scenario: Non-admin tries to turn it on
- **WHEN** a signed-in user who is not an admin tries to change the switch
- **THEN** the server responds 403 and the switch is unchanged

### Requirement: Accounts created by sign-up are ordinary users
An account created through open sign-up SHALL get the role `user`, whatever role the request body names.

#### Scenario: Request asks for admin
- **WHEN** sign-up is on and the request body sets `role` to `admin`
- **THEN** the new account has role `user`

### Requirement: Sign-up uses the same password rules
Open sign-up SHALL apply the same password policy and the same login rate limit as existing registration.

#### Scenario: Weak password
- **WHEN** sign-up is on and the password fails the password policy
- **THEN** the server responds 400 with the policy message and creates no account

#### Scenario: Repeated attempts
- **WHEN** one client makes more sign-up requests than the login rate limit allows
- **THEN** the server responds with the rate-limit error and does not create further accounts

### Requirement: Sign-up page appears only when enabled
The login page SHALL show the "Create account" link and the sign-up form only while the switch is on.

#### Scenario: Switch on
- **WHEN** the switch is on and a visitor opens the login page
- **THEN** the page shows "Create account", and the form creates an account and signs the visitor in

#### Scenario: Switch off
- **WHEN** the switch is off and a visitor opens the login page
- **THEN** the page shows no sign-up link or form

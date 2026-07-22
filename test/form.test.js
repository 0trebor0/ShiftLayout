const assert = require('node:assert/strict');
const test = require('node:test');

const ShiftLayout = require('..');

test('form controls map input behavior and validation constraints', () => {
    const result = new ShiftLayout().convert(`
        <form id="signup" action="/signup" method="post">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required minlength="5" maxlength="80"
                autocomplete="email" enterkeyhint="send" pattern=".+@.+">
            <button type="submit">Create</button>
        </form>
    `);
    assert.match(result.layout, /android:id="@\+id\/email"[\s\S]*android:inputType="textEmailAddress"/);
    assert.match(result.layout, /android:id="@\+id\/email"[\s\S]*android:autofillHints="email"/);
    assert.match(result.layout, /android:id="@\+id\/email"[\s\S]*android:imeOptions="actionSend"/);
    assert.equal(result.forms[0].id, 'signup');
    assert.equal(result.forms[0].fields[0].required, true);
    assert.equal(result.forms[0].fields[0].constraints.minlength, '5');
    assert.equal(result.forms[0].fields[0].constraints.pattern, '.+@.+');
});

test('helper and error references generate Material captions and metadata', () => {
    const result = new ShiftLayout().convert(`
        <form id="profile">
            <input id="username" aria-describedby="username_help" aria-errormessage="username_error" aria-invalid="true">
            <small id="username_help">Use lowercase letters</small>
            <p id="username_error">Username is unavailable</p>
        </form>
    `);
    assert.match(result.layout, /app:helperText="Username is unavailable"/);
    assert.match(result.layout, /app:errorEnabled="true"/);
    assert.equal(result.forms[0].fields[0].helperText, 'Use lowercase letters');
    assert.equal(result.forms[0].fields[0].errorText, 'Username is unavailable');
    assert.equal(result.forms[0].fields[0].invalid, true);
});

test('select options produce Android array resources', () => {
    const result = new ShiftLayout().convert(`
        <select id="plan"><option>Starter</option><option selected>Team</option></select>
    `);
    assert.match(result.layout, /android:entries="@array\/plan_entries"/);
    assert.match(result.values['arrays.xml'], /<item>Starter<\/item>/);
    assert.match(result.values['arrays.xml'], /<item>Team<\/item>/);
    assert.match(result.layout, /android:selectedItemPosition="1"/);
});

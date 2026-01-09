const ShiftLayout = require('./lib.js');
const sculptor = new ShiftLayout({ useConstraint: true });

const html = `
    <div id="login_card" style="background-color: white; padding: 20px; width: 100%;top:0;">
    <h1 style="color: black; font-size: 24px;">Register</h1>
    <input type="text" id="inputusername" placeholder="Username" style="margin: 10px;padding: 10px;background-color:yellow;">
    <input type="text" id="inputemail" placeholder="Email" style="margin: 10px;padding: 10px; background-color:yellow;">
    <input type="text" id="inputpassword" placeholder="Password" style="margin: 10px; padding: 10px; background-color:yellow;">
    <button style="background-color: blue; color: white;">Submit</button>
</div>
`;

console.log(sculptor.convert(html));

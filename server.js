/*
  {
    ToCountry: 'US',
    MediaContentType0: 'image/jpeg',
    ToState: 'NY',
    SmsMessageSid: '...',
    NumMedia: '1',
    ToCity: '',
    FromZip: '12345',
    SmsSid: '...',
    FromState: 'NY',
    SmsStatus: 'received',
    FromCity: 'NEW YORKISH',
    Body: '',
    FromCountry: 'US',
    To: '+12345678910',
    ToZip: '',
    NumSegments: '1',
    MessageSid: '...',
    AccountSid: '...',
    From: '+12345678910',
    MediaUrl0: 'url here',
    ApiVersion: '2010-04-01'
  }
*/

const strings = {
  FIRST_CONTACT: '🤖 Number registered! What is your Slate.host API key?',
  NO_AUTH_ID: '🤖 I still need your Slate.host API key, yo.',
}

const getString = async label => {
  if (strings.hasOwnProperty(label))
    return strings[label]
  throw new Error('string no existo:', label);
}

(async() => {
  
var express = require('express')
var bodyParser = require('body-parser')
const fetch = require('node-fetch')

var app = express()
app.use(express.static('public'))
app.use(bodyParser.urlencoded({extended: false}))

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN

const client = require('twilio')(twilioAccountSid, twilioAuthToken)

// global var for info about the last message
let message = {}

/*
{
  phoneNum: {
    phoneNum: '',
    authId: '',
    slateId: ''
  }
}
*/
let accounts = {}

const accountExists = async (accounts, msg) => {
  return accounts.hasOwnProperty(msg.phoneNum)
}

// Configure your Twilio phonenumber with http://projectdomain.glitch.me/message
// when an SMS comes in, Twilio makes a POST request to this endpoint
app.post("/message", async function (request, response) {
  
  // data about the SMS passed in the request parameters
  const msg = request.body
  const messageType = getMessageType(accounts, msg)
    
  const states = {
    NO_ACCOUNT: onNoAccount,
    NO_AUTH_ID: onNoAuthId,
    NO_SLATE_ID: onNoSlateId,
    CONFIGURED: onConfigured
  }
  
  const onNoAccount = async () => {
    accounts[phoneNum] = {
      phoneNum: phoneNum,
      authId: '',
      slateId: ''
    }

    let txt = '🤖 Number registered! What is your Slate.host API key?'
    response.send(wrapResponseText(txt))
  }
  
  const onNoAuthId = async () => {
  }
  
  const onNoSlateId = async () => {
  }
  
  const onConfigured = async () => {
  }
  
  const messageTypes = {
    FIRST_CONTACT: 1,
    AUTH_ID: 2,
    SLATE_ID: 3,
    PHOTO: 4,
    UNKNOWN: 5
  }
  
  const getMessageType = async (accounts, msg) => {
    const phoneNum = request.body.From
    const msgText = request.body.Body
    const accountExists = accounts.hasOwnProperty(phoneNum)
    if (!accountExists)
      return messageTypes.FIRST_CONTACT;
    if (msgText.indexOf('SLA') == 0)
      return messageTypes.AUTH_ID;
    if (msgText.indexOf('slate:') == 0)
      return messageTypes.SLATE_ID;
    if (msg.MediaUrl0)
      return messageTypes.PHOTO;
    return messageTypes.UNKNOWN;
  }
  
  const messageType = getMessageType(accounts, msg)
  
  
  let account = accounts[phoneNum]  
  
  // register api key
  if (msgText.indexOf('SLA') == 0) {
    account.authId = request.body.Body
  }
  
  // no api key yet
  if (account.authId.length == 0) {
    let txt = '🤖 I still need your Slate.host API key, yo.'
    response.send(wrapResponseText(txt))
    return;
  }
  
  if (msgText.indexOf('slate:') == 0) {
    const providedName = msgText.replace('slate:', '').trim()
    console.log('provided slate', providedName)
    const el = account.slates.find(el => el.slatename == providedName)
    if (el) {
      account.slateId = el.id
    }
    response.send(wrapResponseText(el.slatename))
    return;
  }
  
  // no slate id yet
  if (account.slateId.length == 0) {
    const resp = await getSlates(account.authId)
    console.log(resp)
    account.slates = resp.slates
    const names = account.slates.map(obj => obj.slatename)
    let txt = '🤖 Which slate to upload to by default? Reply with "slate: " followed by one of these names: ' + names.join(',')
    response.send(wrapResponseText(txt))
    return;
  }

  /*
  if (request.body.MediaUrl0) {
    fetch(iftttURL, {
      method: 'POST',
      body: JSON.stringify(iftttMsg),
      headers: { 'Content-Type': 'application/json' }
    })
    .then(res => console.log('posted image to ifttt'))
  }
  */
  
  /*
  // we'll stick that data into a global variable for the client to retreive
  message['body'] = request.body.Body
  message['from'] = "XXX-XXX-" + request.body.From.slice(-4)
  //message['mediaURL'] = request.body.MediaUrl0
  
  // send back some TwiML (XML) for the reply text
  let responseText = 'wtf'
  if (responseText.length > 0) {
    response.send(wrapResponseText(responseText))
  }
  */
})

function wrapResponseText(text) {
  return '<Response><Message>' + text + '</Message></Response>'
}

const getSlates = async (authId) => {
  const resp = await fetch('https://slate.host/api/v1/get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + authId,
    },
    body: JSON.stringify({ data: { private: false }})
  })
  const slates = await resp.json()
  return slates;
}

app.get("/message-for-client", function (request, response) {
  // send back the global message var to parse on frontend
  response.send(message)
})

// serve up the homepage
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html')
})

// start the server
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
})

})()


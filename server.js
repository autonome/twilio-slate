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
  FIRST_CONTACT: '🤖 Hello ☎ person, welcome to the dweb! What is your Slate.host API key?',
  NEED_AUTH_ID: '🤖 I need your Slate.host API key, yo.',
  INVALID_AUTH_ID: '🤖 Er, that does not look like a Slate API key - they start with SLA...',
  NEED_SLATE_ID: '🤖 What is the name of the Slate u want to post to?',
  SLATE_ID_SAVED: '🤖 FINE, I will post to Slate ',
  SLATE_ID_IT_AINT: '🤖 Er, that is not one of your Slates, here are your Slates:',
  SLATE_ATE_IT_GOOD: '🤖 Slate just put your photo on the dweb, share victoriously: ',
  SLATE_NO_LIKEY: '🤖 Slate just could not even deal with that image, keeled over. Sorry.',
  WHATEVER: '🤖 I don\'t even know what you\'re talking about.',
}

const getString = label => {
  if (strings.hasOwnProperty(label))
    return strings[label]
  throw new Error('string no existo:', label);
}

(async() => {
  
const express = require('express')
const bodyParser = require('body-parser')
const fetch = require('node-fetch')
const FormData = require('form-data')
const fileType = require('file-type')

const app = express()
app.use(express.static('public'))
app.use(bodyParser.urlencoded({extended: false}))

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN

const client = require('twilio')(twilioAccountSid, twilioAuthToken)

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('.data/db.json')
const db = low(adapter)

db.defaults({ accounts: [] }).write()

let accounts = {}

const getAccount = num => {
  let a = db.get('accounts')
    .find({ phoneNum: num })
    .value()
  
  if (!a) {
    db.get('accounts').push({
      currentState: 'UNINITIALIZED',
      phoneNum: num,
      authId: '',
      slateId: ''
    }).write()
  }
  
  return a 
}

// when an SMS comes in, Twilio makes a POST request to this endpoint
app.post("/message", async function (request, response) {
  //console.log(request.body.From, request.body.Body)
  
  // data about the SMS passed in the request parameters
  let ctx = {
    msg: request.body,
    phoneNum: request.body.From,
    msgText: request.body.Body
  }
  
  let account = getAccount(ctx.phoneNum)

  const updateAccount = (num, k, v) => {
    account[k] = v
    db.get('accounts')
      .find({phoneNum: num})
      .assign({k: v})
      .write();
  }
  
  const states = {
    UNINITIALIZED: {
      on: async () => {

        // don't do anything if there's no phonenum
        // should never happen lolcry
        if (ctx.phoneNum.length == 0)
          return;

        response.send(wrapResponseText(getString('FIRST_CONTACT')))

        // update state
        updateAccount(ctx.phoneNum, 'currentState', 'NEED_AUTH_ID')
      }
    },
    NEED_AUTH_ID: {
      on: async () => {

        // register api key
        // TODO: validate
        if (ctx.msgText.indexOf('SLA') == 0) {
          // store
          updateAccount(ctx.phoneNum, 'authId', request.body.Body)
          // update state
          updateAccount(ctx.phoneNum, 'currentState', 'NEED_SLATE_ID')
          // populate slates
          const resp = await getSlates(account.authId)
          //account.slates = resp.slates
          updateAccount(ctx.phoneNum, 'slates', resp.slates)
          // send response
          const names = account.slates.map(obj => obj.slatename)
          response.send(wrapResponseText(getString('NEED_SLATE_ID') + ' ' + names.join(', ')))
        }
        else if (ctx.msgText.length > 0) {
          response.send(wrapResponseText(getString('INVALID_AUTH_ID')))
        }
        else {
          response.send(wrapResponseText(getString('NEED_AUTH_ID')))
        }
      }
    },
    NEED_SLATE_ID: {
      on: async () => {
        const msgText = ctx.msgText

        if (msgText.length < 0) {
          // send response
          const names = account.slates.map(obj => obj.slatename)
          response.send(wrapResponseText(getString('NEED_SLATE_ID') + ' ' + names.join(', ')))
        }
        else {
          const providedName = msgText.trim()
          const el = account.slates.find(el => el.slatename == providedName)
          if (el) {
            updateAccount(ctx.phoneNum, 'slateId', el.id)
            updateAccount(ctx.phoneNum, 'slate', el)
            response.send(wrapResponseText(getString('SLATE_ID_SAVED') + el.slatename))
            // update state
            updateAccount(ctx.phoneNum, 'currentState', 'CONFIGURED')
          }
          else {
            // send response
            const names = account.slates.map(obj => obj.slatename)
            response.send(wrapResponseText(getString('SLATE_ID_IT_AINT') + ' ' + names.join(', ')))
          }
        }
      }
    },
    CONFIGURED: {
      on: async () => {
        const msgText = ctx.msgText
        const imageURL = ctx.msg.MediaUrl0

        if (imageURL && imageURL.length > 0) {
          
          // fetch image data
          const imgResponse = await fetch(imageURL)
          const buffer = await imgResponse.buffer()

          // post image to slate
          const resp = await postToSlate(account, buffer)

          if (resp.hasOwnProperty('url')) {
            response.send(wrapResponseText(getString('SLATE_ATE_IT_GOOD') + resp.url))
          }
          else {
            response.send(wrapResponseText(getString('SLATE_NO_LIKEY')))
          }
        }
        else if (msgText.length > 0) {
          response.send(wrapResponseText(getString('WHATEVER')))
        }
      }
    }
  }

  await states[account.currentState].on()
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
  //response.send(message)
})

// serve up the homepage
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html')
})

const postToSlate = async (account, buffer) => {
  const url = "https://uploads.slate.host/api/public/" + account.slateId;

  const type = await fileType.fromBuffer(buffer);

  let data = new FormData();
  data.append("data", buffer, "fromphone." + type.ext);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      // NOTE: your API key
      Authorization: "Basic " + account.authId
    },
    body: data
  });

  // NOTE: the URL to your asset will be available in the JSON response.
  const json = await response.json();
  return json
}

// start the server
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
})

})()


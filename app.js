var request = require('request');
var express = require('express');
var session = require('express-session')
var Grant = require('grant-express');
var bodyParser = require('body-parser')

var handlebars = require('handlebars');
var path = require("path");

const interactive = require('beam-interactive-node2');
const ws = require('ws');

var Stopwatch = require('timer-stopwatch');

var spawn = require('child_process').spawn;
var fs = require('fs');

const opn = require('opn');
//---------------------------
var controls = [
  {
    "kind": "button",
    "controlID": "M1",
    "position": [
      {
        "size": "large",
        "width": 14,
        "height": 4,
        "x": 16,
        "y": 4
      }
    ],
    "text": "Movement 1",
    "cost": 2
  },
  {
    "kind": "button",
    "controlID": "M2",
    "position": [
      {
        "size": "large",
        "width": 14,
        "height": 4,
        "x": 37,
        "y": 4
      }
    ],
    "text": "Movement 2",
    "cost": 2
  },
  {
    "kind": "button",
    "controlID": "M3",
    "position": [
      {
        "size": "large",
        "width": 14,
        "height": 4,
        "x": 16,
        "y": 12
      }
    ],
    "text": "Movement 3",
    "cost": 2
  },
  {
    "kind": "button",
    "controlID": "M4",
    "position": [
      {
        "size": "large",
        "x": 37,
        "y": 12,
        "width": 14,
        "height": 4
      }
    ],
    "text": "Movement 4",
    "cost": 2
  }
];
var mixerControls;
//---------------
//Buttons pressed
var m1 = 0;
var m2 = 0;
var m3 = 0;
var m4 = 0;
//------------------
var automaticControl = true;
//--------
var started = false;
//--------
var configuration = {};
//-------
//Load Configuration
function loadConfiguration() {
  fs.readFile('./config', 'utf8', function (err, data) {
    if (err) {
      console.log("Loading default configuration");
      loadDefaultConfig();
      return;
    }
    configuration = JSON.parse(data);
    for (var i = 0; i < controls.length; i++) {
      controls[i].text = configuration.buttons[i]["m" + (i + 1) + "Name"];
    }
    //console.log(controls);
  });
}

function loadDefaultConfig() {
  fs.readFile('./configDefault', 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }
    configuration = JSON.parse(data);
    for (var i = 0; i < controls.length; i++) {
      controls[i].text = configuration.buttons[i]["m" + (i + 1) + "Name"];
    }
    //console.log(controls);
  });
}
//-----------
var grant = new Grant({
  "server": {
    "protocol": "https",
    "host": "mixer.com"
  },
  "mixer": {
    "authorize_url": "https://mixer.com/oauth/authorize",
    "access_url": "https://mixer.com/api/v1/oauth/token",
    "oauth": 2,
    "key": "bd243bc411336ceae3d72bf5f581e8dc0da83f3238827d0f",
    "secret": "",
    "redirect_uri": "http://localhost:3000/authorized",
    "scope": ["interactive:robot:self"]
  }
});
var server = express();

interactive.setWebSocket(ws);
const client = new interactive.GameClient();

server.use(session({ secret: 'grant' }))
server.use(grant)
server.use(express.static(__dirname + '/public'));
server.use(bodyParser.json());       // to support JSON-encoded bodies
server.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

server.get('/', function (req, res) {
  fs.readFile(path.join(__dirname + '/public/views/index.html'), 'utf-8', function (error, source) {
    var template = handlebars.compile(source);
    var object = JSON.stringify(configuration.buttons).replaceAll("{", "").replaceAll("}", "").replaceAll("\\[", "{").replaceAll("\\]", "}");
    var html = template(JSON.parse(object));
    res.send(html);
  });
});

String.prototype.replaceAll = function (search, replacement) {
  var target = this;
  return target.replace(new RegExp(search, 'g'), replacement);
};

//Get the token to allow app comunicate with mixer
//----------------------
server.get('/connect', function (req, res) {
  res.redirect("/connect/mixer");
});

server.get('/authorized', function (req, res) {
  //console.log(req);
  request({
    method: 'POST',
    url: 'https://mixer.com/api/v1/oauth/token',
    headers: {
      'Content-Type': 'application/json'
    },
    body: "{  \"code\": \"" + req.query.code + "\",  \"client_id\": \"bd243bc411336ceae3d72bf5f581e8dc0da83f3238827d0f\", \"redirect_uri\": \"http://localhost:3000/authorized\",\"grant_type\": \"authorization_code\"}"
  }, function (error, response, body) {
    req.session.token = body;
    res.redirect("/");
    client.open({
      authToken: JSON.parse(body).access_token,
      versionId: 97064,
    }).then(() => {
      return client.createControls({
        sceneID: 'default',
        controls: controls,
      });
    }).then(controls => {
      // Now that the controls are created we can add some event listeners to them!
      mixerControls = controls;
      for (var i = 0; i < controls.length; i++) {
        if (controls[i].kind == "button") {
          controls[i].on('mousedown', (inputEvent, participant) => {
            switch (inputEvent.input.controlID) {
              case "M1":
                m1++;
                break;
              case "M2":
                m2++;
                break;
              case "M3":
                m3++;
                break;
              case "M4":
                m4++;
                break;
            }
            // Did this push involve a spark cost?
            if (inputEvent.transactionID) {
              // Unless you capture the transaction the sparks are not deducted.
              //client.captureTransaction(inputEvent.transactionID);
            }
          });
        }
      }
      disableButtons();
      // Controls don't appear unless we tell Interactive that we are ready!
      client.ready(true);
      started = true;
    });
  });
});
//--------------------
server.get('/activate', function (req, res) {
  movementReset();
  var timer = new Stopwatch(10000); // A new countdown timer with 10 seconds
  timer.start();
  enableButtons();
  timer.onDone(function () {
    disableButtons();
    if (automaticControl) {
      selectInput(getMax());
    }
  });
  res.redirect("/");
});

server.get('/automaticControl', function (req, res) {
  if (automaticControl) {
    automaticControl = false;
  } else {
    automaticControl = true;
  }
});

server.post('/save', function (req, res) {
  configuration.buttons = req.body.buttons;
  fs.writeFileSync('./config', JSON.stringify(configuration), 'utf-8');
  loadConfiguration();
  if(started){
    client.ready(false);
    updateButtonOnMixer();
  }
});

server.get('/getMostVoted', function (req, res) {
  res.send(getMostVoted());
});

function updateButtonOnMixer() {
  var scene = client.state.getScene('default');
  scene.deleteAllControls().then(() => client.createControls({
    sceneID: 'default',
    controls: controls,
  }).then(controls => {
    // Now that the controls are created we can add some event listeners to them!
    mixerControls = controls;
    for (var i = 0; i < controls.length; i++) {
      if (controls[i].kind == "button") {
        controls[i].on('mousedown', (inputEvent, participant) => {
          switch (inputEvent.input.controlID) {
            case "M1":
              m1++;
              break;
            case "M2":
              m2++;
              break;
            case "M3":
              m3++;
              break;
            case "M4":
              m4++;
              break;
          }
          // Did this push involve a spark cost?
          if (inputEvent.transactionID) {
            // Unless you capture the transaction the sparks are not deducted.
            //client.captureTransaction(inputEvent.transactionID);
          }
        });
      }
    }
    disableButtons();
    // Controls don't appear unless we tell Interactive that we are ready!
    client.ready(true);
  }));
}

function input(direction) {
  var child = spawn('java', ['-jar', 'GameControl.jar', direction]);
}

function selectInput(button) {
  switch (button) {
    case "m1":
      input("right");
      sleep(500);
      input("accept");
      break;
    case "m2":
      input("right");
      sleep(500);
      input("right");
      sleep(500);
      input("accept");
      break;
    case "m3":
      input("right");
      sleep(500);
      input("down");
      sleep(500);
      input("accept");
      break;
    case "m4":
      input("right");
      sleep(500);
      input("right");
      sleep(500);
      input("down");
      sleep(500);
      input("accept");
      break;
  }
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

function getMax() {
  var max = "";
  var maxValue = Math.max(m1, m2, m3, m4);
  if (m1 == maxValue) {
    max = "m1";
  } else if (m2 == maxValue) {
    max = "m2";
  } else if (m3 == maxValue) {
    max = "m3";
  } else if (m4 == maxValue) {
    max = "m4";
  }
  return max;
}

function getMostVoted(callback) {
  switch (getMax()) {
    case "m1":
      return configuration.buttons[0].m1Name;
      break;
    case "m2":
      return configuration.buttons[1].m2Name;
      break;
    case "m3":
      return configuration.buttons[2].m3Name;
      break;
    case "m4":
      return configuration.buttons[3].m4Name;
      break;
  }
}

function movementReset() {
  m1 = 0;
  m2 = 0;
  m3 = 0;
  m4 = 0;
}

function resetPosition() {

}

function disableButtons() {
  for (var i = 0; i < mixerControls.length; i++) {
    if (mixerControls[i].kind == "button") {
      mixerControls[i].disable();
    }
  }
}

function enableButtons() {
  for (var i = 0; i < mixerControls.length; i++) {
    if (mixerControls[i].kind == "button") {
      mixerControls[i].enable();
    }
  }
}

server.listen(3000, function () {
  console.log('Play Pokemon running on port 3000!');
  loadConfiguration();
  //opn('http://localhost:3000');
});

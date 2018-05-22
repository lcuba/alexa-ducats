
const alexaSDK = require('alexa-sdk');
const awsSDK = require('aws-sdk');

const appId = 'amzn1.ask.skill.2b268e97-c65e-477a-9b47-c3de27b7d18e';
const groceryListTable = 'Groceries';
const docClient = new awsSDK.DynamoDB.DocumentClient();
const ua = require('universal-analytics');

// convert callback style functions to promises
/*const dbScan = promisify(docClient.scan, docClient);
const dbGet = promisify(docClient.get, docClient);
const dbPut = promisify(docClient.put, docClient);
const dbDelete = promisify(docClient.delete, docClient); */

const instructions = `Welcome to Grocery List Manager<break strength="medium" />
                      The following commands are available: add an item to your grocery list, read all items, and remove an item. What would you like to do?`;

const handlers = {

  /**
   * Triggered when the user says "Alexa, open Grocery List Manager"
   */
  'LaunchRequest'() {
    this.emit(':ask', instructions);
  },

  /**
   * Starts a grocery item list.
   * Slots: GroceryItemName
   */
  'NewGroceryItemIntent'() {
    const { userId } = this.event.session.user;
    const { slots } = this.event.request.intent;
    const intentTrackingID = ua('UA-119699645-1');

    // prompt for slot values and request a confirmation

    // GroceryItemName
    if (!slots.GroceryItemName.value) {
      const slotToElicit = 'GroceryItemName';
      const speechOutput = 'What would you like to add to your grocery list?';
      const repromptSpeech = 'Please tell me what you would like to add to your grocery list.';
      intentTrackingID.event("unconfirmed","unconfirmed but valid slot value").send();
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }
    else if (slots.GroceryItemName.confirmationStatus !== 'CONFIRMED') {

      if (slots.GroceryItemName.confirmationStatus !== 'DENIED') {
        // slot status: unconfirmed
        const slotToConfirm = 'GroceryItemName';
        const speechOutput = `The item that you would like to add is ${slots.GroceryItemName.value}, correct?`;
        const repromptSpeech = speechOutput;
        return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
      }

      // slot status: denied -> reprompt for slot data
      intentTrackingID.event("denied", "slot value " + slots.GroceryItemName.value + " denied by user").send();
      const slotToElicit = 'GroceryItemName';
      const speechOutput = 'What would you like to add to your grocery list?';
      const repromptSpeech = 'Please tell me what you would like to add to your grocery list.';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }
    intentTrackingID.event("success", "slot value confirmed as " + slots.GroceryItemName.value).send();
    // all slot values received and confirmed, now add the record to DynamoDB

    const name = slots.GroceryItemName.value;
    const dynamoParams = {
      TableName: groceryListTable,
      Item: {
        Name: name,
        UserId: userId
      }
    };

    const checkIfItemExistsParams = {
      TableName: groceryListTable,
      Key: {
        Name: name,
        UserId: userId
      }
    };

    console.log('Attempting to add item to list', dynamoParams);

    // query DynamoDB to see if the item exists first
    docClient.get(checkIfItemExistsParams).promise().then(data => {
        console.log('Get item succeeded', data);

        const groceryItem = data.Item;

        if (groceryItem) {
          const errorMsg = `Grocery item ${name} already exists!`;
          this.emit(':tell', errorMsg);
          throw new Error(errorMsg);
        }
        else {
          // no match, add the recipe
          return docClient.put(dynamoParams).promise();
        }
      })
      .then(data => {
        console.log('Add item succeeded', data);

        this.emit(':tell', `Grocery item ${name} added!`);
      })
      .catch(err => {
        console.error(err);
      });
  },


   //Lists all grocery items for the current user.
  'GetAllGroceryItemsIntent'() {
    const { userId } = this.event.session.user;
    const { slots } = this.event.request.intent;
    let output;
    const intentTrackingID = ua('UA-119699645-1');
    intentTrackingID.event("read all pending", "attempting to read grocery list from database").send();

    const dynamoParams = {
      TableName: groceryListTable
    };
    //getting all items from DynamoDB table by user id
    dynamoParams.FilterExpression = 'UserId = :user_id';
    dynamoParams.ExpressionAttributeValues = { ':user_id': userId };
    output = 'Here\'s what\'s on your grocery list: <break strength="x-strong" />';

    // query DynamoDB
    docClient.scan(dynamoParams).promise().then(data => {
        console.log('Read table succeeded!', data);

        if (data.Items && data.Items.length) {
          data.Items.forEach(item => { output += `${item.Name}<break strength="x-strong" />`; });
        }
        else {
          output = 'No grocery items found!';
        }

        console.log('output', output);

        this.emit(':tell', output);
      })
      .catch(err => {
        console.error(err);
      });
      intentTrackingID.event("read all success", "successfully read grocery list from database").send();
  },
  //intent to remove a single, specified item from the grocery list
  'RemoveGroceryItemIntent'() {
    const { slots } = this.event.request.intent;
    const intentTrackingID = ua('UA-119699645-1');

    // prompt for the grocery item name if needed and then require a confirmation
    if (!slots.GroceryItemName.value) {
      const slotToElicit = 'GroceryItemName';
      const speechOutput = 'What item would you like to remove from your grocery list?';
      const repromptSpeech = 'Please say what item you would like to remove';
      intentTrackingID.event("delete unconfirmed","unconfirmed but valid slot value for deletion").send();
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }
    else if (slots.GroceryItemName.confirmationStatus !== 'CONFIRMED') {

      if (slots.GroceryItemName.confirmationStatus !== 'DENIED') {
        // slot status: unconfirmed
        const slotToConfirm = 'GroceryItemName';
        const speechOutput = `You would like to remove ${slots.GroceryItemName.value}, correct?`;
        const repromptSpeech = speechOutput;
        return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
      }

      // slot status: denied -> reprompt for slot data
      intentTrackingID.event("delete denied", "slot value " + slots.GroceryItemName.value + " denied by user for deletion").send();
      const slotToElicit = 'GroceryItemName';
      const speechOutput = 'What item would you like to remove from your grocery list?';
      const repromptSpeech = 'Please say what item you would like to remove';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }
    intentTrackingID.event("delete success", "slot value " + slots.GroceryItemName.value + " confirmed by user for deletion").send();

    const { userId } = this.event.session.user;
    const groceryItem = slots.GroceryItemName.value;
    const dynamoParams = {
      TableName: groceryListTable,
      Key: {
        Name: groceryItem,
        UserId: userId
      }
    };

    console.log('Attempting to read data');

    // query DynamoDB to see if the item exists first
    docClient.get(dynamoParams).promise().then(data => {
        console.log('Get item succeeded', data);

        const grocery = data.Item;

        if (grocery) {
          console.log('Attempting to delete data', data);

          return docClient.delete(dynamoParams).promise();
        }

        const errorMsg = `Grocery item ${groceryItem} not found!`;
        this.emit(':tell', errorMsg);
        throw new Error(errorMsg);
      })
      .then(data => {
        console.log('Delete item succeeded', data);

        this.emit(':tell', `Grocery item ${groceryItem} deleted!`);
      })
      .catch(err => console.log(err));
  },

  'Unhandled'() {
    console.error('problem', this.event);
    this.emit(':ask', 'An unhandled problem occurred!');
    const intentTrackingID = ua('UA-119699645-1');
    intentTrackingID.event("error", "an unhandled exception occurred (alexa misheard)").send();
  },

  'AMAZON.HelpIntent'() {
    const speechOutput = instructions;
    const reprompt = instructions;
    this.emit(':ask', speechOutput, reprompt);
    const intentTrackingID = ua('UA-119699645-1');
    intentTrackingID.event("help request", "user asked for help").send();
  },

  'AMAZON.CancelIntent'() {
    this.emit(':tell', 'Goodbye!');
    const intentTrackingID = ua('UA-119699645-1');
    intentTrackingID.event("session end", "user ended the session manually").send();
  },

  'AMAZON.StopIntent'() {
    this.emit(':tell', 'Goodbye!');
    const intentTrackingID = ua('UA-119699645-1');
    intentTrackingID.event("session end", "user ended the session manually").send();
  }
};

exports.handler = function handler(event, context) {
  const alexa = alexaSDK.handler(event, context);
  alexa.APP_ID = appId;
  alexa.registerHandlers(handlers);
  alexa.execute();
};

const Alexa = require('alexa-sdk');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const request = require('request');
const util = require('util');
const docClient = new AWS.DynamoDB.DocumentClient();


const dbScan = util.promisify(docClient.scan.bind(docClient));
const dbDelete = util.promisify(docClient.delete.bind(docClient));

const tableName = 'ClothingTable2';

const instructions = `Welcome to Dresser.<break time="0.5s"/> You can say <break time="0.5s"/> random outfit <break time="0.5s"/> to get a random 
outfit <break time="0.5s"/> or <break time="0.5s"/> store in dresser <break time="0.5s"/> to store a new article of clothing in your dresser. What would you like to do?`


const handlers = {

    'LaunchRequest' : function(){
        this.emit(":ask", instructions);
    },
    'Unhandled': function () {
        this.attributes.speechOutput = this.t('HELP_MESSAGE');
        this.attributes.repromptSpeech = this.t('HELP_REPROMPT');
        return this.emit(':ask', this.attributes.speechOutput, this.attributes.repromptSpeech);
    },
    'FallbackIntent' : function(){
        console.log("FALLBACK")
        this.emit(":ask", "Say again?")
    },
    'addClothingIntent' : function(){
        
        if(this.event.request.dialogState != "COMPLETED"){
            return this.emit(":delegate");
        }else{
            const {slots} = this.event.request.intent; 
            const { userId } = this.event.session.user;
            const color = slots.ClothingColor.value;
            const brand = slots.ClothingBrand.value;
            const type = slots.ClothingType.value;
            
            var params = {
                TableName: tableName,
                Item : {
                    'itemId': uuidv4(),//Generate random primary key for database
                    'color': color,
                    'clothingType': type,
                    'brand': brand,
                    'userId': userId
                }
            }

            var checkIfExistsParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id AND userId = :Id',
                ExpressionAttributeValues : {':type' : type, ":Id" : userId}
            }

            //Retrieve all objects of this type
            docClient.scan(checkIfExistsParams, (err, data) => {
                if (err){ console.log(err)}
                else{
                     console.log(data)
                     //If thereare none of this type of clothing item in DB, then this one can be stored
                     if(data.Count == 0){
                         docClient.put(params, (err, data) => {
                         if (err) console.log(err);
                         else console.log(data);
                         this.emit(':tell', 'Clothing Item added to your dresser.')
                         });
                    }else{
                        //Check if a clothing item of this type with the same brand and color already exists in the DB
                        console.log("SEARCHING...");
                        let found = false;
                        data.Items.forEach(function(item){
                            console.log(item);
                            if(item.clothingType === type && item.color === color && item.brand === brand){
                                console.log("FOUND");
                                found = true;
                            }
                        })
                        //If the same piece of clothing was found, it will not be added. Otherwise,
                        //Add it to the dresser.
                        if(found){
                            this.emit(':tell', 'Clothing item already in dresser');
                        }else{
                            docClient.put(params, (err, data) => {
                                if (err) console.log(err);
                                else{ 
                                    this.emit(":tell", "Clothing item added to your dresser")
                                };
                            });
                        }
                    }
                }
             });
        }
    },
    'getOutfitIntent' : function(){

        var deviceId = this.event.context.System.device.deviceId;
        var accessToken = this.event.context.System.apiAccessToken;
        var APIendpoint = this.event.context.System.apiEndpoint;

        const das = new Alexa.services.DeviceAddressService();

        das.getFullAddress(deviceId, APIendpoint, accessToken)
            .then((data) => {
                
                if(data.country === null || data.countryCode === null){
                    console.log("ERROR IN LOCATION VALUES - USING DEFAULT")
                    getOutfit.call(this, "Ottawa", "CAN");   

                }else{
                    console.log("FOUND ADDRESS")
                    getOutfit.call(this, data.city, data.countryCode);
                }
                   
            })
            .catch((error) => {
                console.log("ERROR IN API CALL - USING DEFAULT")
                console.log(error);
                getOutfit.call(this, "Ottawa", "CAN");   
            })


    },
    'AMAZON.HelpIntent' : function(){
        const speechOutput = instructions;
        const reprompt = instructions;
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.StopIntent' : function(){
        this.emit(":tell", "GoodBye")
    },
    'deleteItemIntent' : function(){
        if(this.event.request.dialogState != "COMPLETED"){
            return this.emit(":delegate");
        }else{
            const {slots} = this.event.request.intent; 
            const { userId } = this.event.session.user;
            const color = slots.color.value;
            const brand = slots.brand.value;
            const type = slots.type.value;
            console.log(slots);

            var params = {
                TableName : tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id AND userId = :Id AND color = :color AND brand = :brand',
                ExpressionAttributeValues : {':type' : type, ":Id" : userId, ':color' : color, ':brand' : brand}
            }

            dbScan(params)
            .then((data) => {
                console.log(data.Items);
                if(data.Items.length > 0){
                    item = data.Items[0];
                    var deleteParams = {
                        Key : {
                            itemId : item.itemId,
                            clothingType : item.clothingType
                        },
                        TableName : tableName,
                    }

                    dbDelete(deleteParams)
                    .then((data) => {
                        console.log(data)
                        this.emit(":tell", "Item deleted")
                    })
                    .catch((err) => {
                        console.log(err);
                    })
                }else{
                    this.emit(":tell", "Could not find this clothing item in your dresser");
                }
            })
            .catch((err) => {
                console.log(err)
            })
        }
    },
    'emptyDresserIntent' : function(){

        if(this.event.request.dialogState != "COMPLETED"){
            return this.emit(":delegate");
        }else{
        
            const { userId } = this.event.session.user;

            var params = {
                TableName: tableName,
                FilterExpression : 'userId = :Id',
                ExpressionAttributeValues : { ':Id' : userId}
            }

            dbScan(params)
            .then((data) => {
                console.log(data);
                data.Items.forEach((item) => {
                    var deleteParams = {
                        Key : {
                            itemId : item.itemId,
                            clothingType : item.clothingType
                        },
                        TableName : tableName,
                    }
                    dbDelete(deleteParams)
                    .then((data) => {
                        console.log(data);
                        this.emit(":tell", "Your dresser is now empty")
                    })
                    .catch((err) => {
                        console.log(err);
                    })
                })
            })
            
            .catch((err) => {
                console.log(err);
            })
        }
    }
}

//function to select random bottoms.
function pickBottom(shorts, pants, clothing, isCold){
    console.log(clothing);
    //If it is not cold, select shorts if there are any otherwise select pants
    if(!isCold){
        if(shorts.length > 0){
            clothing.push(pickRandom(shorts));
        }else{
            if(pants.length > 0){
                clothing.push(pickRandom(pants));
            }else{
                console.log("No bottoms")
            }
        }
    //If it is cold select pants
    }else{
        if(pants.length > 0){
            clothing.push(pickRandom(pants));
        }else{
            console.log("No pants")
        }
    }
}

function pickRandom(clothesArray){
    console.log(clothesArray.length);
    var randIndex = Math.floor(Math.random() * (clothesArray.length));
    console.log(randIndex);
    return clothesArray[randIndex];
}

function getOutfit(city, country){
    request(`http://api.openweathermap.org/data/2.5/weather?q=${city},${country}&APPID=07dcfee4c868ec91c360a79ab03370ad`, (error, response, body) => {
            
            const { userId } = this.event.session.user;

            if(error){
                console.log(error);
            }

            var res = JSON.parse(body);
            
            var temperatureCelsius = Math.round((res.main.temp - 273.15) * 100) / 100
            
            var isCold = temperatureCelsius<10 ? true : false;

            
            
            var getRandomShirtParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id',
                ExpressionAttributeValues : {':type' : 'shirt', ':Id' : userId}
            }

            var getRandomPantsParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id',
                ExpressionAttributeValues : {':type' : 'pants', ':Id' : userId}
            }

            var getRandomHatParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id',
                ExpressionAttributeValues : {':type' : 'hat', ':Id' : userId}
            }

            var getRandomSweaterParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id',
                ExpressionAttributeValues : {':type' : 'sweater', ':Id' : userId}
            }

            var getRandomShortsParams = {
                TableName: tableName,
                FilterExpression : 'clothingType = :type AND userId = :Id',
                ExpressionAttributeValues : {':type' : 'shorts', ':Id' : userId}
            }

            Promise.all([dbScan(getRandomShirtParams), dbScan(getRandomPantsParams), dbScan(getRandomHatParams), dbScan(getRandomSweaterParams), dbScan(getRandomShortsParams)]).then((values => {
                
                var shirts = values[0].Items;
                var pants = values[1].Items;
                var hats = values[2].Items;
                var sweaters = values[3].Items;
                var shorts = values[4].Items;
                
                var selectedClothing = [];

                console.log(shirts);
                console.log(pants);
                console.log(hats);
                console.log(sweaters);
                console.log(shorts);
                
                //Select random shirt to wear
                if(shirts.length > 0){ 
                    selectedClothing.push(pickRandom(shirts));
                }else{
                    console.log("no shirts")
                }
                
                //Select random bottoms
                pickBottom.call(this, shorts, pants, selectedClothing, isCold);

                if(hats.length > 0){
                    selectedClothing.push(pickRandom(hats));
                }else{
                   console.log("No hats")
                }

                if(isCold && sweaters.length >0){
                    selectedClothing.push(pickRandom(sweaters))
                }

                var outputSpeech = `The temperature is ${temperatureCelsius} degrees in ${city}. <break time="1s"/>Your outfit is: `
                
                console.log(selectedClothing);
                for(var i = 0 ; i<selectedClothing.length ; i++){
                    outputSpeech += `${selectedClothing[i].color} ${selectedClothing[i].brand} ${selectedClothing[i].clothingType}<break time="1s"/> `;
                }
                
                console.log(outputSpeech);
                this.emit(':tell', outputSpeech);
            }))
        })
}

exports.handler = function(event, context, callback){
    const alexa = Alexa.handler(event, context, callback);
    alexa.registerHandlers(handlers);
    alexa.execute();
}

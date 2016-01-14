'use strict';

var Backbone = require('backbone'),
    $ = require('jquery'),
    config = require('../main/config'),
    _ = require('lodash'),
    Router = require('../routing/router'),
    Dialog = require('bootstrap-dialog'),
    i18n = require('i18next-client'),
    Observation = require('../observation/observation.model'),
    User = require('../profile/user.model');

Backbone.LocalStorage = require('backbone.localstorage');

var SessionModel = Backbone.Model.extend({
  defaults: {
    token: null,
    isAuth: false,
    authStatus: '',
    network: false,
  },
  initialize: function() {
    var self = this;

    this.on('change:network', function() {
      if (this.get('network'))
        $('body').alterClass('*-network', 'is-network');
      else
        $('body').alterClass('*-network', 'not-network');
    });
  },

  getToken: function() {
    var self = this;
    var dfd = $.Deferred();

    // Call system connect with session token.
    $.ajax({
      url: config.apiUrl + '/user/token.json',
      type: 'post',
      dataType: 'json',
      contentType: 'application/json',
      xhrFields: {
        withCredentials: true
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.log(errorThrown);
        Dialog.alert({
          closable: true,
          message: errorThrown
        });
        dfd.reject();
      },
      success: function(response) {
        self.set('token', response.token);
        dfd.resolve();
      }
    });

    return dfd;
  },

  //test if user is connected
  isConnected: function() {
    var self = this;
    var dfd = $.Deferred();

    if (!navigator.onLine) {
      dfd.reject();
    } else {
        // Call system connect with session token.
      var query = {
        url: config.apiUrl + '/system/connect.json',
        type: 'post',
        dataType: 'json',
        contentType: 'application/json',
        error: function(jqXHR, textStatus, errorThrown) {
          Dialog.alert({
            closable: true,
            message: errorThrown
          });
          dfd.reject();
        },
        success: function(data) {
          console.log('Hello user #' + data.user.uid);
          dfd.resolve(data);
        }
      };
      self.getCredentials(query).then(function() {
        $.ajax(query);
      });
    }

    return dfd;
  },

  getCredentials: function(query, checkUser) {
    var self = this;
    var dfd = $.Deferred();

    query.xhrFields = query.xhrFields || {};
    query.xhrFields.withCredentials = true;
    self.getToken().then(function() {
      query.headers = query.headers || {};
      query.headers['X-CSRF-Token'] = self.get('token');

      if ( !checkUser )
        dfd.resolve();
      else {
        self.isConnected().then(function(data) {
          if ( data.user.uid == User.getCurrent().get('externId') )
            dfd.resolve();
          else {
            self.logout().then(function(success) {
              dfd.resolve();
            }, function(error) {
              dfd.reject();
            });
          }
        }, function(error) {
          dfd.resolve();
        });
      }
    }, function(error) {
      dfd.reject();
    });

    return dfd;
  },

  login: function(username, password) {
    var self = this;
    var dfd = $.Deferred();

    this.logout().always(function() {
      var query = {
        url: config.apiUrl + '/obfmobile_user/login.json',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          username: username,
          password: password,
        }),
        error: function(jqXHR, textStatus, errorThrown) {
          console.log(jqXHR, textStatus, errorThrown);
          Dialog.alert({
            closable: true,
            message: errorThrown
          });
          dfd.reject(errorThrown);
        },
        success: function(response) {
          self.set('isAuth', true);

          var users = User.collection.getInstance();
          var user = users.findWhere({email: response.user.mail});
          if ( !user )
            user = users.findWhere({externId: response.user.uid});
          if ( !user )
            user = users.getAnonymous();
          user.set({
            'lastname': _.get(response.user.field_last_name, 'und[0].value', ''),
            'firstname': _.get(response.user.field_first_name, 'und[0].value', ''),
            'email': response.user.mail,
            'externId': response.user.uid,
            'newsletter': _.get(response.user.field_newsletter, 'und[0].value', '')
          }).save();
          self.syncObs(response.obs);

          User.collection.getInstance().setCurrent(user);

          if ( self.afterLoggedAction && self[self.afterLoggedAction.name] ) {
            self[self.afterLoggedAction.name](self.afterLoggedAction.options);
          }
          self.afterLoggedAction = null;

          dfd.resolve(user);
        }
      };
      self.getCredentials(query).done(function() {
        $.ajax(query);
      });
    });

    return dfd;
  },

  showObsAndTransmit: function(options) {
    var obs = Observation.collection.getInstance().findWhere({id: options.id});
    if ( obs && obs.get('userId') == User.getCurrent().get('id') ) {
      Observation.idToTransmit = options.id;
      Router.getInstance().navigate('observation/'+options.id, {trigger:true});
    }
  },

  syncObs: function(obs){

  },

  logout: function() {
    var self = this;
    var dfd = $.Deferred();

    /*if ( !this.get('isAuth') )
      dfd.resolve();*/

    var query = {
      url: config.apiUrl + '/user/logout.json',
      type: 'post',
      contentType: 'application/json',
      error: function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR, textStatus, errorThrown);
        dfd.reject(errorThrown);
        Dialog.alert({
          closable: true,
          message: errorThrown
        });
      },
      success: function(response) {
        self.set('isAuth', false);
        dfd.resolve(response);
      }
    };
    this.getCredentials(query).then(function() {
      $.ajax(query);
    });

    return dfd;
  },

  /*addObsAnonymous: function() {
    var dfd = $.Deferred();
    this.findUser('email', '').then(function(user) {
      Observation.collection.getInstance().fetch().then(function() {
        var obsAnonymous = Observation.collection.getInstance().where({
          userId: user.get('id')
        });
        if (obsAnonymous.length) {
          obsAnonymous.forEach(function(item) {
            item.set({
              userId: User.model.getInstance().get('id')
            });
          });
        }

        dfd.resolve(obsAnonymous);
      });
    });
    return dfd;
  },*/
});

var Collection = Backbone.Collection.extend({
  model: SessionModel,
  url: '',
  localStorage: new Backbone.LocalStorage('sessionCollection')
});

var modelInstance = null;
var collectionInstance = null;

module.exports = {
  model: {
    ClassDef: SessionModel,
    getClass: function() {
      return SessionModel;
    },
    getInstance: function() {
      if (!modelInstance) {
        collectionInstance = new Collection();
        modelInstance = collectionInstance.add(new SessionModel());
      }
      return modelInstance;
    }
  },
  collection: {
    getInstance: function() {
      if (!collectionInstance)
          collectionInstance = new Collection();
      return collectionInstance;
    }
  }
};

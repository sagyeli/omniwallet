
angular.module('omniwallet')
  .factory('wallet_balances_template', function($q, $http) {
    var deferred = $q.defer();

    $http.get('/partials/wallet_address_list.html').then(function(result) {
      deferred.resolve(result.data);
    });

    return deferred.promise;
  })
  .factory('wallet_balances_data', function($http, $q, $timeout, $injector, Wallet) {
    var count = 1;
    return {
      "getData": function() {
        var deferred = $q.defer();

        _.defer(function() {
          if (Wallet.addresses && Wallet.addresses.length > 0) {
            var requests = [];

            var balances = {};
            var invalidAddresses = [];
            var currencyInfo;
            var emptyAddresses = [];

            var appraiser = $injector.get('appraiser');
            var Account = $injector.get('Account');
            showtesteco = Account.getSetting('showtesteco');

            Wallet.addresses.forEach(function(addr) {
              if (addr.balance.length == 0) {
                console.log('No balances for ' + addr.address + ', invalid address?');
                invalidAddresses.push(addr.address);
              } else {
                addr.balance.forEach(function(currencyItem) {
                 if ((parseInt(currencyItem.id,10) < 2147483648) && (parseInt(currencyItem.id,10) != 2) || showtesteco === 'true'){
                  if(currencyItem.divisible){
                    var value=new Big(currencyItem.value).times(WHOLE_UNIT).valueOf();
                    var pendingpos=new Big(currencyItem.pendingpos).times(WHOLE_UNIT).valueOf();
                    var pendingneg=new Big(currencyItem.pendingneg).times(WHOLE_UNIT).valueOf();
                  } else {
                    var pendingpos=currencyItem.pendingpos;
                    var pendingneg=currencyItem.pendingneg;
                  }

                  if (!balances.hasOwnProperty(currencyItem.symbol)) {
                    balances[currencyItem.symbol] = {
                      "symbol": currencyItem.symbol,
                      "balance": +value || +currencyItem.value,
                      "value": appraiser.getValue(currencyItem.value, currencyItem.symbol, currencyItem.divisible),
                      "pendingpos": +pendingpos,
                      "pendingneg": +pendingneg,
                      "addresses": {}
                    };
                  } else {
                    balances[currencyItem.symbol].balance += +value || +currencyItem.value;
                    balances[currencyItem.symbol].value += appraiser.getValue(currencyItem.value, currencyItem.symbol, currencyItem.divisible);
                    balances[currencyItem.symbol].pendingpos += +pendingpos;
                    balances[currencyItem.symbol].pendingneg += +pendingneg;
                  }

                  if (currencyItem.symbol == 'BTC') {
                    balances[currencyItem.symbol].name = "Bitcoin"
                  }
          		    if (addr.privkey) {
          			   hasPrivate=true;
          		    } else {
          			   hasPrivate=false;
          		    }
          		    if (addr.pubkey) {
                   isOffline=true;
                  } else {
                   isOffline=false;
                  }
                  balances[currencyItem.symbol].addresses[addr.address] = {
                    "address": addr.address,
                    "qr": "https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl="+addr.address+"&choe=UTF-8",
                    "balance": +value || currencyItem.value,
                    "pendingpos": pendingpos,
                    "pendingneg": pendingneg,
                    "value": appraiser.getValue(currencyItem.value, currencyItem.symbol, currencyItem.divisible),
	                  "private": hasPrivate,
	                  "offline": isOffline
                  };
                 }
                });
              }
            });
            // First, the standard currencies.
            $http.get('/v1/transaction/values.json').then(function(result) {
              currencyInfo = result.data;
              currencyInfo.forEach(function(item) {
                if (balances.hasOwnProperty(item.currency))
                  balances[item.currency].name = item.name;
              });

              // Now, any applicable smart properties.
              var spReqs = [];

              for (var b in balances) {
                var spMatch = balances[b].symbol.match(/^SP([0-9]+)$/);
                if (spMatch != null) {
                  var updateFunction = function(result) {
                    if (result.status == 200) {
                      this.property_type = result.data[0].formatted_property_type
                      this.name = result.data[0].propertyName + ' (' + this.symbol.match(/^SP([0-9]+)$/)[1] + ')';
                    }
                  };
                  spReqs.push($http.get('/v1/property/' + spMatch[1] + '.json').then(updateFunction.bind(balances[b])));
                }
              }

              if (spReqs.length > 0) {
                $q.all(spReqs).then(function() {
                  deferred.resolve(
                  {
                    balances: balances,
                    currencies: currencyInfo
                  });
                });
              } else {
                deferred.resolve(
                {
                  balances: balances,
                  currencies: currencyInfo
                });
              }
            });
          } else {
            $http.get('/v1/transaction/values.json').then(function(currencyInfo) {
              deferred.resolve({
                currencies: currencyInfo
              });
            }
            );
          }
        });

        return deferred.promise;
      }
    };
  })
  .directive('showWalletBalances', function($compile, $injector) {
    return {
      scope: true,
      link: function(scope, element, attrs) {
        var el;

        attrs.$observe('template', function(tpl) {
          if (angular.isDefined(tpl)) {
            // compile the provided template against the current scope
            el = $compile(tpl)(scope);

            // stupid way of emptying the element
            element.html("");

            // add the template content
            element.append(el);
          }
        });
      }
    }
  })
  .controller('WalletBalancesController', function($modal, $rootScope, $injector, $scope, wallet_balances_data, wallet_balances_template, Account) {

  var appraiser = $injector.get('appraiser');
  $rootScope.$on('APPRAISER_VALUE_CHANGED', function() {
    $scope.refresh();
  });
  $rootScope.$on('BALANCE_CHANGED', function() {
    if(!$scope.isLoading)
      $scope.refresh();
  });

  $scope.openDeleteConfirmForm = function(addritem) {
    if (!$scope.modalOpened) {
      $scope.modalOpened = true;
      var modalInstance = $modal.open({
        templateUrl: '/partials/delete_address_modal.html',
        controller: DeleteBtcAddressModal,
        resolve: {
          address: function() {
            return addritem;
          }
        }
      });
      modalInstance.result.then(function() {
	      Account.removeAddress(addritem.address);
              $scope.modalOpened=false;
	      $scope.refresh();
        },
        function() {
  	     $scope.modalOpened=false;
      });
    }
  };

  $scope.broadcastTransaction = function(signedHex, from, $modalScope){
    var walletTransactionService = $injector.get('walletTransactionService');
    walletTransactionService.getArmoryRaw(signedHex).then(function(result){
      var finalTransaction = result.data.rawTransaction;
    
      //Showing the user the transaction hash doesn't work right now
      //var transactionHash = Bitcoin.Util.bytesToHex(transaction.getHash().reverse());

      walletTransactionService.pushSignedTransaction(finalTransaction).then(function(successData) {
        var successData = successData.data;
        if (successData.pushed.match(/submitted|success/gi) != null) {
          $modalScope.waiting = false;
          $modalScope.transactionSuccess = true;
          $scope.refresh();
          if(TESTNET)
            $modalScope.url = 'http://tbtc.blockr.io/tx/info/' + successData.tx;
          else
            $modalScope.url = 'http://blockchain.info/address/' + from + '?sort=0';
        } else {
          $modalScope.waiting = false;
          $modalScope.transactionError = true;
          $modalScope.error = successData.pushed; //Unspecified error, show user
        }
      }, function(errorData) {
        $modalScope.waiting = false;
        $modalScope.transactionError = true;
        if (errorData.message)
          $modalScope.error = 'Server error: ' + errorData.message;
        else 
          if (errorData.data)
            $modalScope.error = 'Server error: ' + errorData.data;
          else
            $modalScope.error = 'Unknown Server Error';
        console.error(errorData);
      });
    })
  };

  $scope.openBroadcastTransactionForm =function(address){
    var modalInstance = $modal.open({
        templateUrl: "/partials/wallet_broadcast_modal.html",
        controller: function($scope, $modalInstance, address, broadcastTransaction) {
          $scope.broadcastAddress = address;
          
          $scope.ok = function(signedHex) {
            $scope.clicked = true;
            $scope.waiting = true;
            broadcastTransaction(signedHex, address, $scope);
          };
          
          $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
          };
          
          $scope.close = function () {
            $modalInstance.dismiss('close');
          };
        },
        resolve: {
          broadcastTransaction: function() {
              return $scope.broadcastTransaction;
          }, address: function(){
            return address;
          }
        }
      });
  };

  $scope.refresh = function() {

    $scope.items = wallet_balances_data.getData().then(function(balances) {
      $scope.balances = balances;
      wallet_balances_template.then(function(templ) {
        _.defer(function() {
          $scope.template = templ;
          $scope.$apply();
        });
      });
    });
  };
});


var DeleteBtcAddressModal = function($scope, $modalInstance, address) {
  $scope.address = address.address;
  $scope.private = address.private;

  $scope.ok = function() {
    $modalInstance.close();
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };
};



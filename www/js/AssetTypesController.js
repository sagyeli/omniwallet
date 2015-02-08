angular.module('omniwallet')
  .factory('asset_types_template', function($q, $http) {
    var deferred = $q.defer();

    $http.get('/partials/asset_types.html').then(function(result) {
      deferred.resolve(result.data);
    });

    return deferred.promise;
  })
  .factory('asset_types_data', function($http, $q, $timeout, $injector, Wallet) {
    var count = 1;
    return {
      "getData": function() {
        //console.log( '*** getData!' );
        var deferred = $q.defer();

        _.defer(function() {
          if (Wallet.addresses && Wallet.addresses.length > 0) {
            var requests = [];

            var balances = {};
            var currencyInfo;
            var emptyAddresses = [];

            var appraiser = $injector.get('appraiser');
            var Account = $injector.get('Account');
            showtesteco = Account.getSetting('showtesteco');

            Wallet.addresses.forEach(function(addr) {
              addr.balance.forEach(function(currencyItem) {
                if ((parseInt(currencyItem.id,10) < 2147483648) && (parseInt(currencyItem.id,10) != 2) || showtesteco === 'true'){
                  if(currencyItem.divisible) {
                    var value=new Big(currencyItem.value).times(WHOLE_UNIT).valueOf();
                    var pendingpos=new Big(currencyItem.pendingpos).times(WHOLE_UNIT).valueOf();
                    var pendingneg=new Big(currencyItem.pendingneg).times(WHOLE_UNIT).valueOf();
                  } else {
                    var pendingpos=currencyItem.pendingpos;
                    var pendingneg=currencyItem.pendingneg;
                  }

                  if (!balances.hasOwnProperty(currencyItem.symbol)) {
                    var asset = Wallet
                    balances[currencyItem.symbol] = {
                      "symbol": currencyItem.symbol,
                      "id" : currencyItem.id,
                      "balance": +value || +currencyItem.value,
                      "value": appraiser.getValue(currencyItem.value, currencyItem.symbol, currencyItem.divisible),
                      "pendingpos": +pendingpos,
                      "pendingneg": +pendingneg
                    };
                  } else {
                    balances[currencyItem.symbol].balance += +value || +currencyItem.value;
                    balances[currencyItem.symbol].value += appraiser.getValue(currencyItem.value, currencyItem.symbol, currencyItem.divisible);
                    balances[currencyItem.symbol].pendingpos += +pendingpos;
                    balances[currencyItem.symbol].pendingneg += +pendingneg;
                  }
                  //console.log(balances);
                  if (currencyItem.symbol == 'BTC') {
                    balances[currencyItem.symbol].name = "Bitcoin"
                  } else if (currencyItem.symbol == 'MSC') {
                    balances[currencyItem.symbol].name = "Mastercoin"
                  } else if (currencyItem.symbol == 'TMSC') {
                    balances[currencyItem.symbol].name = "Test Mastercoin"
                  } else {
                    var spMatch = currencyItem.symbol.match(/^SP([0-9]+)$/);

                    if (spMatch != null) {
                      var asset = Wallet.getAsset(spMatch[1]);
                      balances[currencyItem.symbol].name = asset.name

                    }
                  }
                }
              });
            });
            deferred.resolve({
              balances: balances,
            });
          } else {
            deferred.resolve({
              balances: [],
            });
          }
        });

        return deferred.promise;
      }
    };
  })
  .directive('showAssetTypes', function($compile, $injector) {
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
  .controller('AssetTypesController', function($q, $http, $modal, $rootScope, $injector, $scope, $element, asset_types_data, asset_types_template, Account, Wallet) {

  var appraiser = $injector.get('appraiser');
  $rootScope.$on('APPRAISER_VALUE_CHANGED', function() {
    if(!$scope.isLoading)
      $scope.refresh();
  });
  $rootScope.$on('BALANCE_CHANGED', function() {
    if(!$scope.isLoading)
      $scope.refresh();
  });

  $scope.CSYM=Account.getSetting("usercurrency");

  $scope.refresh = function() {

    if (!Account.loggedIn) {
      //console.log("caught attempted refresh after logout");
      return 0;
    }

    $scope.isLoading = true;
    $scope.items = asset_types_data.getData().then(function(balances) {

      $scope.balances = balances;
      $scope.totals = {};
      var total = 0;
      for (var k in balances.balances) {
        if (typeof balances.balances[k].value == 'number'){
          total += balances.balances[k].value;

          var symbolTotal = $scope.totals[k]
          //          console.log(symbolTotal, successData.balance[i].symbol)
          if (!symbolTotal)
            $scope.totals[k] = 0
          
          // property == 1 is for undivisible coins, convert to satoshis otherwise.
          $scope.totals[k] += balances.balances[k].property_type == 1 ? balances.balances[k].balance : +(new Big(balances.balances[k].balance).times(SATOSHI_UNIT).valueOf())
        }
      }
      $scope.total = total;

      asset_types_template.then(function(templ) {
        _.defer(function() {
          $scope.template = templ;
          $scope.$apply(new function() {
            _.defer(updateGraph);
          });
        });
      });
      $scope.isLoading = false;
      //console.log("loading refreshed stop");
    });
  }


  function getAssetBalances(currencySymbol) {
    var deferred = $q.defer();
    var wallet = Account.wallet;
    if (wallet && wallet.addresses.length > 0) {
      var requests = [];
      var balances = [];
      var appraiser = $injector.get('appraiser');
      wallet.addresses.forEach(function(addr) {
        requests.push($injector.get('balanceService').balance(addr.address)
        .then(function(result) {
          var resultBalances = result.data.balance;
          for (var i in resultBalances) {
            var value = null;
            var item = resultBalances[i];
            if(item.divisible) {
              value=new Big(item.value).times(WHOLE_UNIT).valueOf();
              var pendingpos=new Big(item.pendingpos).times(WHOLE_UNIT).valueOf();
              var pendingneg=new Big(item.pendingneg).times(WHOLE_UNIT).valueOf();
            } else {
              var pendingpos=item.pendingpos;
              var pendingneg=item.pendingneg;
            }
            if (item.symbol == currencySymbol) {
              balances.push({
                "address": addr,
                "balance": +value || item.value,
                "value": appraiser.getValue(item.value, currencySymbol, item.divisible),
                "pendingpos": +pendingpos,
                "pendingneg": +pendingneg
              });
            }
          }
        })
        );
      });
      $q.all(requests).then(function(responses) {
        deferred.resolve(balances);
      });
    }
    return deferred.promise;
  }

  $scope.openCurrencyDetail = function(currencySymbol) {
    $scope.currencySymbol = currencySymbol;
    $scope.currencyName = "";
    var currencies = Wallet.assets;
    currencies.forEach(function(currency) {
      if (currency.symbol == currencySymbol) {
        $scope.currencyName = currency.symbol == "BTC" ? "Bitcoin" : currency.symbol == "MSC" ? "Mastercoin" : currency.symbol == "TMSC" ? "Test Mastercoin" : currency.name;
      }
    });
    if (!$scope.modalOpened) {
      $scope.modalOpened = true;
      var modalInstance = $modal.open({
	resolve: {
	  currencySymbol: function() {
	    return currencySymbol;
	  },
	  balances: function() {
	    return getAssetBalances(currencySymbol);
	  },
	  currencyName: function() {
	    return $scope.currencyName;
	  }
	},
	templateUrl: '/partials/currency_detail_modal.html',
	controller: CurrencyDetailModal
      });
      modalInstance.result.then(function(){},
      function(){
        $scope.modalOpened = false;
      });
    }
  };

  function updateGraph() {
    //console.log( '*** updateGraph!' );
    $scope.chart = {
      width: 300,
      height: 300
    }
    $scope.radius = Math.min($scope.chart.width, $scope.chart.height) / 2

    $element.find('#all-assets-graph').attr('height', $scope.chart.height).attr('width', $scope.chart.width);

    var color = d3.scale.category20()

    var arc = d3.svg.arc()
    .outerRadius($scope.radius - 10)
    .innerRadius(0);

    var pie = d3.layout.pie()
    .sort(null)
    .value(function(d) {
      return d.value;
    });

    var svg = d3.select("#all-assets-graph")

    if ($scope.totals) {
      

        var appraiser = $injector.get('appraiser');
        var data = [],
          keys = Object.keys($scope.totals);
        keys.forEach(function(e, i) {
          var ptype = $scope.balances.balances[e].property_type;
          if (ptype == 1) { 
            divisible=false } else {
            divisible=true }
          var value = appraiser.getValue($scope.totals[e], keys[i], divisible);
          if (typeof value == 'number' && value > 0) {
            data.push({
              value: value,
              name: keys[i],
              color: data.length
            });
          }
        });

        //console.log( '*** updateGraph, data.length: ' + data.length );
        //console.log( data );
        if (data.length > 0) {
          var g = svg.selectAll(".arc")
          .data(pie(data))
          .enter().append("g")
          .attr("class", "arc");

          g.append("path")
            .attr("d", arc)
            .style("fill", function(d) {
              return color(d.data.color);
            })
            .attr('transform', 'translate(150,150)');

          g.append("text")
            .attr("transform", function(d) {
              var c = arc.centroid(d);
              return "translate(" + (150 + c[0]) + "," + (150 + c[1]) + ")";
            })
            .attr("dy", ".35em")
            .style("text-anchor", "middle")
            .text(function(d) {
            return d.data.name;
          });
        }
    }

  }
  ;

});

var CurrencyDetailModal = function($scope, currencySymbol, balances, currencyName) {
  $scope.currencySymbol = currencySymbol;
  $scope.balances = balances;
  $scope.currencyName = currencyName;
};

